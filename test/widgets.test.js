// -----------------------------------------------------------------------------
// The `latest_changes` widget: content validated by the SDK (the core's rules),
// newest changes first, badges, links, buttons and their actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { ACTIONS, MAX_ROWS } from '../src/widgets.js';
import {
  CD_URL,
  FakeChangedetection,
  UUIDS,
  createDevices,
  createWorld,
  deviceId,
  watch,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const result = ack.data.content ?? ack.data;
  assert.deepEqual(validateWidgetContent(result), []);
  return result;
}

const byType = (result, type) => result.components.filter((c) => c.type === type);

test('the latest changes, newest first, with the unviewed and error counts', async (t) => {
  const w = await world(t);
  w.cd.change(UUIDS.news, 'News\n\nMarket on Saturday\n\nNew bakery opens on the main square');
  w.clock.advance(60_000);
  await w.hub.pollNow();
  const result = await content(w);
  const [unviewed, errors] = byType(result, 'value');
  assert.equal(unviewed.value, 1);
  assert.equal(errors.value, 1);
  const [list] = byType(result, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge?.text]),
    [
      ['Village news', 'New'],
      ['Broken page', 'Error'],
    ],
  );
  assert.equal(list.items[0].subtitle, 'New bakery opens on the main square');
  assert.equal(list.items[0].date, new Date(1792569074 * 1000).toISOString());
  assert.deepEqual(list.items[0].links, [
    { url: 'https://news.example.org/village', label: 'Open the page' },
  ]);
  const buttons = byType(result, 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    [ACTIONS.CHECK_ALL, ACTIONS.MARK_ALL_VIEWED],
  );
  assert.equal(buttons[1].action.confirm, true);
});

test('no change yet, and the French texts', async (t) => {
  const cd = new FakeChangedetection({ watches: [] });
  const w = await world(t, { cd, config: { url: CD_URL, api_key: 'cd-test-key' } });
  const result = await content(w, {}, 'fr');
  assert.equal(byType(result, 'text')[0].text, 'Aucun changement détecté pour le moment.');
  assert.equal(byType(result, 'button').length, 1, 'nothing to mark as viewed');
  assert.equal(byType(result, 'button')[0].label, 'Vérifier');
});

test('not configured, and changedetection.io down', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match(byType(await content(empty), 'text')[0].text, /Enter the address/);
  const w = await world(t);
  w.cd.failure = 'down';
  await w.hub.pollNow();
  const result = await content(w);
  assert.equal(byType(result, 'text')[0].text, 'changedetection.io does not answer');
});

test('the chosen watches only, and eight rows at most', async (t) => {
  const watches = Array.from({ length: 12 }, (_, i) =>
    watch({
      uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Page ${i}`,
      snapshots: [
        { at: 1792569000 + i, text: 'a' },
        { at: 1792569100 + i, text: 'b' },
      ],
    }),
  );
  const w = await world(t, { cd: new FakeChangedetection({ watches }) });
  const all = byType(await content(w), 'card-list')[0];
  assert.equal(all.items.length, MAX_ROWS);
  assert.equal(all.items[0].title, 'Page 11');
  await createDevices(w);
  const chosen = await content(w, { watches: [deviceId(w.gladys, watches[3].uuid)] });
  assert.deepEqual(
    byType(chosen, 'card-list')[0].items.map((item) => item.title),
    ['Page 3'],
  );
});

test('the buttons: check every page, mark every change as viewed', async (t) => {
  const w = await world(t);
  w.cd.change(UUIDS.news, 'News\n\nOther');
  await w.hub.pollNow();
  let ack = await w.fake.widgetAction(WIDGET_KEY, ACTIONS.CHECK_ALL, {}, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.cd.rechecked, ['all']);
  ack = await w.fake.widgetAction(WIDGET_KEY, ACTIONS.MARK_ALL_VIEWED, {}, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.equal(w.hub.watches.get(UUIDS.news).unviewed, false);
});
