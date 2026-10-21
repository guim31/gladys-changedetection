// -----------------------------------------------------------------------------
// The hub, end to end: the SDK's fake Gladys on one side, an in-memory
// changedetection.io on the other, a manual clock. Devices, states, changes
// and their scene events, persistence across restarts, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { FEATURE_KEYS, serverIds } from '../src/devices.js';
import {
  API_KEY,
  CD_URL,
  FakeChangedetection,
  UUIDS,
  createClock,
  createDevices,
  createWorld,
  deviceId,
  featureId,
  serverFeatureId,
  watch,
} from './helpers/world.js';

async function world(t, options = {}) {
  const result = await createWorld(options);
  t.after(() => result.app.stop());
  return result;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

async function step(w, ms = 60_000) {
  w.clock.advance(ms);
  await w.hub.pollNow();
}

test('the server and one device per watch in the Discovery tab, nothing polled by Gladys', async (t) => {
  const w = await world(t);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['changedetection.io', serverIds(w.gladys).device],
      ['Village news', deviceId(w.gladys, UUIDS.news)],
      ['Coffee grinder', deviceId(w.gladys, UUIDS.shop)],
      ['Broken page', deviceId(w.gladys, UUIDS.broken)],
    ],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  const [, news, shop] = devices;
  assert.deepEqual(
    news.features.map((f) => f.external_id),
    ['unviewed', 'error', 'error_message', 'last_change', 'excerpt'].map((key) =>
      featureId(w.gladys, UUIDS.news, key),
    ),
  );
  const price = shop.features.find((f) => f.external_id.endsWith(':price'));
  assert.equal(price.category, 'currency');
  assert.equal(price.unit, 'euro', 'the default currency');
  assert.deepEqual(news.params, [{ name: 'WATCH_URL', value: 'https://news.example.org/village' }]);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.states.length, 0, 'nothing sent for devices not added');
  assert.equal(w.fake.sceneEvents.length, 0, 'the first read announces nothing');
});

test('the price takes the currency of the configuration', async (t) => {
  const w = await world(t, { config: { url: CD_URL, api_key: API_KEY, currency: 'dollar' } });
  const shop = w.fake.discoveredDevices.find(
    (d) => d.external_id === deviceId(w.gladys, UUIDS.shop),
  );
  assert.equal(shop.features.find((f) => f.external_id.endsWith(':price')).unit, 'dollar');
  assert.equal(shop.features[0].name, 'Changement non vu', 'French names by default');
});

test('adding a device publishes all its states at once', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const state = (uuid, key) => w.fake.lastState(featureId(w.gladys, uuid, key));
  assert.equal(state(UUIDS.news, FEATURE_KEYS.UNVIEWED), 0);
  assert.equal(state(UUIDS.news, FEATURE_KEYS.ERROR), 0);
  assert.equal(state(UUIDS.news, FEATURE_KEYS.ERROR_MESSAGE), 'None');
  assert.equal(state(UUIDS.news, FEATURE_KEYS.LAST_CHANGE), undefined, 'no change yet');
  assert.equal(state(UUIDS.shop, FEATURE_KEYS.PRICE), 129.9);
  assert.equal(state(UUIDS.shop, FEATURE_KEYS.IN_STOCK), 0);
  assert.equal(state(UUIDS.broken, FEATURE_KEYS.ERROR), 1);
  assert.match(state(UUIDS.broken, FEATURE_KEYS.ERROR_MESSAGE), /500/);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.WATCHES)), 3);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.ERRORS)), 1);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.UNVIEWED_COUNT)), 0);
  assert.ok(JSON.stringify(w.fake.widgetRefreshes).includes(WIDGET_KEY));
  assert.ok(w.fake.transports.every((entry) => entry.transport === 'local'));
  assert.equal(w.fake.transports.length, 4);
});

test('a page changes: the scene event with its excerpt, then the states', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.cd.change(UUIDS.news, 'News\n\nMarket on Saturday\n\nNew bakery opens on the main square');
  await step(w);
  const [event] = events(w, TRIGGERS.CHANGED);
  assert.deepEqual(event.data, {
    device: deviceId(w.gladys, UUIDS.news),
    title: 'Village news',
    url: 'https://news.example.org/village',
    tags: '',
    excerpt: 'New bakery opens on the main square',
  });
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.UNVIEWED)), 1);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.EXCERPT)),
    'New bakery opens on the main square',
  );
  assert.match(
    w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.LAST_CHANGE)),
    /\d{1,2}\/\d{1,2}\/\d{2,4}/,
  );
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.UNVIEWED_COUNT)), 1);

  // Nothing new: no second event, no state sent again.
  const sent = w.fake.states.length;
  await step(w);
  assert.equal(events(w, TRIGGERS.CHANGED).length, 1);
  assert.equal(w.fake.states.length, sent);
});

test('a restock watch: price drop and back in stock, with the tag', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.cd.change(UUIDS.shop, 'In Stock: True - Price: 99.9');
  await step(w);
  const [drop] = events(w, TRIGGERS.PRICE_DROP);
  assert.equal(drop.data.price, 99.9);
  assert.equal(drop.data.previous_price, 129.9);
  assert.equal(drop.data.title, 'Coffee grinder');
  assert.equal(drop.data.tags, 'Shopping');
  const [stock] = events(w, TRIGGERS.BACK_IN_STOCK);
  assert.equal(stock.data.price, 99.9);
  assert.equal(events(w, TRIGGERS.CHANGED).length, 1, 'a change all the same');
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.shop, FEATURE_KEYS.PRICE)), 99.9);
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.shop, FEATURE_KEYS.IN_STOCK)), 1);

  // A price going up, out of stock again: neither event.
  w.cd.change(UUIDS.shop, 'In Stock: False - Price: 109.9');
  await step(w);
  assert.equal(events(w, TRIGGERS.PRICE_DROP).length, 1);
  assert.equal(events(w, TRIGGERS.BACK_IN_STOCK).length, 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.shop, FEATURE_KEYS.IN_STOCK)), 0);
});

test('a watch that starts failing fires once, until it works again', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.cd.get(UUIDS.news).error = 'Error - 404 (Page not found) received from the web site';
  await step(w);
  await step(w);
  const fired = events(w, TRIGGERS.ERROR);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].data.error, 'Error - 404 (Page not found) received from the web site');
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.ERROR)), 1);
  w.cd.get(UUIDS.news).error = false;
  await step(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.ERROR)), 0);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.ERROR_MESSAGE)),
    'None',
  );
  w.cd.get(UUIDS.news).error = 'Error again';
  await step(w);
  assert.equal(events(w, TRIGGERS.ERROR).length, 2);
  assert.equal(
    events(w, TRIGGERS.ERROR).filter((e) => e.data.device === deviceId(w.gladys, UUIDS.broken))
      .length,
    0,
    'a watch already failing at the first read announces nothing',
  );
});

test('a change made while the integration was stopped is announced once after the restart', async (t) => {
  const cd = new FakeChangedetection();
  const first = await createWorld({ cd });
  await first.app.stop();
  cd.change(UUIDS.news, 'News\n\nMarket on Sunday');
  cd.change(UUIDS.shop, 'In Stock: True - Price: 129.9');
  const second = await world(t, { cd, dataDir: first.dataDir });
  const changed = events(second, TRIGGERS.CHANGED);
  assert.equal(changed.length, 2);
  assert.equal(changed[0].data.excerpt, 'Market on Sunday');
  assert.equal(events(second, TRIGGERS.BACK_IN_STOCK).length, 1);
  assert.equal(events(second, TRIGGERS.PRICE_DROP).length, 0, 'same price');
  await second.app.stop();
  const third = await world(t, { cd, dataDir: first.dataDir });
  assert.equal(third.fake.sceneEvents.length, 0, 'not announced twice');
});

test('changedetection.io down: not connected, devices unreachable, then back', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.cd.failure = 'down';
  await step(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  w.cd.failure = null;
  await step(w);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('a refused or missing key, a redirect, another service: the reason in the status', async (t) => {
  const cases = [
    [{ url: CD_URL, api_key: 'wrong' }, null, /API key refused/],
    [{ url: CD_URL }, null, /API key is needed/],
    [{ url: CD_URL, api_key: API_KEY }, 302, /redirects/],
    [{ url: CD_URL, api_key: API_KEY }, 'html', /no changedetection\.io API/],
    [{ url: CD_URL, api_key: API_KEY }, 'tls', /certificate refused/],
    [{ url: 'ftp://nope' }, null, /Address not understood/],
    [{}, null, /Enter the address/],
  ];
  for (const [config, failure, message] of cases) {
    const cd = new FakeChangedetection();
    cd.failure = failure;
    const w = await world(t, { cd, config: { ...config, language: 'en' } });
    assert.equal(w.fake.connectionStatus.connected, false);
    assert.match(w.fake.connectionStatus.message.en, message);
  }
});

test('a new watch is proposed, a deleted one disappears', async (t) => {
  const w = await world(t);
  w.cd.watches.delete(UUIDS.broken);
  await step(w);
  assert.equal(w.fake.discoveredDevices.length, 3);
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('the internal timer reads changedetection.io, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, {
    timers: true,
    config: { url: CD_URL, api_key: API_KEY, poll_interval: '30' },
  });
  await createDevices(w);
  w.cd.change(UUIDS.news, 'News\n\nNew line');
  t.mock.timers.tick(30_000);
  // Let the read and the publications settle.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(events(w, TRIGGERS.CHANGED).length, 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, UUIDS.news, FEATURE_KEYS.UNVIEWED)), 1);
});

test('every state is sent again after 12 hours, even unchanged (heartbeat)', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const id = featureId(w.gladys, UUIDS.news, FEATURE_KEYS.UNVIEWED);
  const count = () => w.fake.states.filter((s) => s.device_feature_external_id === id).length;
  const before = count();
  await step(w, 3600_000);
  assert.equal(count(), before);
  await step(w, 12 * 3600_000);
  assert.equal(count(), before + 1);
});

test('the clock of the tests is used for the dates', () => {
  const clock = createClock();
  assert.equal(new Date(clock.now()).toISOString(), '2026-10-21T10:00:00.000Z');
});

// --- Logs ----------------------------------------------------------------------------

/** Everything written to stdout and stderr while `fn` runs, at `level`. */
async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      w.cd.get(UUIDS.news).lastChecked += 60;
      await step(w);
    }
  });
  assert.deepEqual(lines, []);
});

test('changedetection.io unreachable for long: one line, and one when it answers again', async (t) => {
  const w = await world(t);
  const lines = await captureLogs(t, 'info', async () => {
    w.cd.failure = 'down';
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await step(w);
    }
    w.cd.failure = null;
    await step(w);
    await step(w);
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /WARN.*ECONNREFUSED/);
  assert.match(lines[1], /answers again/);
  assert.ok(!lines.join('\n').includes(API_KEY));
});

// --- Review fixes ----------------------------------------------------------------------

test('snapshots unreadable after a change: nothing is lost, the change is announced at the next read', async (t) => {
  const w = await world(t);
  w.cd.change(UUIDS.shop, 'In Stock: True - Price: 99.9');
  const request = w.cd.request.bind(w.cd);
  w.cd.request = async (url, options) => {
    if (url.includes('/history')) {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    }
    return request(url, options);
  };
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
  w.cd.request = request;
  await step(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.CHANGED, TRIGGERS.PRICE_DROP, TRIGGERS.BACK_IN_STOCK],
  );
});

test('Gladys refusing a scene event: it is sent again at the next read', async (t) => {
  const w = await world(t);
  w.cd.change(UUIDS.news, 'News\n\nOther');
  const refuse = t.mock.method(w.gladys, 'publishSceneEvent', async () => {
    throw new Error('HTTP 503');
  });
  await step(w);
  assert.equal(refuse.mock.callCount(), 1);
  refuse.mock.restore();
  await step(w);
  assert.equal(events(w, TRIGGERS.CHANGED).length, 1);
  assert.equal(events(w, TRIGGERS.CHANGED)[0].data.excerpt, 'Other');
  await step(w);
  assert.equal(events(w, TRIGGERS.CHANGED).length, 1, 'once');
});

test('a watch switched to "Re-stock & Price detection" gets its price after a Search', async (t) => {
  const w = await world(t);
  const news = () => w.fake.discoveredDevices.find((d) => d.name === 'Village news');
  assert.equal(news().features.length, 5);
  w.cd.get(UUIDS.news).processor = 'restock_diff';
  w.cd.change(UUIDS.news, 'In Stock: True - Price: 12.5');
  await step(w);
  assert.equal(news().features.length, 5, 'the processor is read once');
  await w.hub.rediscover();
  assert.equal(news().features.length, 7);
  assert.equal(w.hub.watches.get(UUIDS.news).price, 12.5);
});

test('a key corrected during a read is used at once, and never reported connected before a read', async (t) => {
  const w = await world(t, { config: { url: CD_URL, api_key: 'wrong', language: 'en' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  const report = await w.hub
    .reconfigure({ ...w.hub.config, apiKey: API_KEY })
    .then(() => w.hub.testConnection());
  assert.match(report.en, /^OK, changedetection\.io 0\.60\.9, 3 watch/);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('never more than 250 states a minute, the rest at the next reads', async (t) => {
  const watches = Array.from({ length: 60 }, (_, i) =>
    watch({ uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `Page ${i}` }),
  );
  const w = await world(t, { cd: new FakeChangedetection({ watches }) });
  w.hub.isCreated = () => true; // every device added
  await w.hub.resync(w.hub.config);
  assert.ok(w.fake.states.length <= 250, `${w.fake.states.length} states`);
  await step(w, 61_000);
  assert.equal(w.fake.states.length, 60 * 3 + 3, 'every watch and the server, in the end');
});
