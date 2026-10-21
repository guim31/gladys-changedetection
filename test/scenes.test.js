// -----------------------------------------------------------------------------
// Scene actions: check now and mark as viewed, for one watch or every watch.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverIds } from '../src/devices.js';
import { TRIGGERS } from '../src/hub.js';
import { CD_URL, UUIDS, createWorld, deviceId } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('check now: one watch, or every watch when empty or the server is chosen', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('check_now', { device: deviceId(w.gladys, UUIDS.news) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { count: 1 });
  ack = await w.fake.sceneAction('check_now', {});
  assert.deepEqual(ack.data.outputs, { count: 3 });
  ack = await w.fake.sceneAction('check_now', { device: serverIds(w.gladys).device });
  assert.deepEqual(ack.data.outputs, { count: 3 });
  assert.deepEqual(w.cd.rechecked, [UUIDS.news, 'all', 'all']);
});

test('mark as viewed: the change no longer counts as new, nothing fired', async (t) => {
  const w = await world(t);
  w.cd.change(UUIDS.news, 'News\n\nOther');
  w.cd.change(UUIDS.shop, 'In Stock: False - Price: 139.9');
  await w.hub.pollNow();
  let ack = await w.fake.sceneAction('mark_viewed', { device: deviceId(w.gladys, UUIDS.news) });
  assert.deepEqual(ack.data.outputs, { count: 1 });
  assert.equal(w.hub.watches.get(UUIDS.news).unviewed, false);
  assert.equal(w.hub.watches.get(UUIDS.shop).unviewed, true);
  ack = await w.fake.sceneAction('mark_viewed', {});
  assert.deepEqual(ack.data.outputs, { count: 1 });
  assert.equal(w.hub.watches.get(UUIDS.shop).unviewed, false);
  assert.equal(w.fake.sceneEvents.filter((e) => e.key === TRIGGERS.CHANGED).length, 2);
});

test('the errors, in the language of the configuration', async (t) => {
  const w = await world(t, { config: { url: CD_URL, api_key: 'cd-test-key', language: 'fr' } });
  let ack = await w.fake.sceneAction('check_now', { device: 'not-ours' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /n'est pas une surveillance/);
  w.cd.failure = 'down';
  ack = await w.fake.sceneAction('mark_viewed', { device: deviceId(w.gladys, UUIDS.news) });
  assert.equal(ack.success, false);
  assert.match(ack.error, /ne répond pas/);
  const empty = await world(t, { config: {} });
  ack = await empty.fake.sceneAction('check_now', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /pas configuré/);
});
