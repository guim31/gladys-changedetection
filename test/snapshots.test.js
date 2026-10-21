// -----------------------------------------------------------------------------
// Snapshots: the restock line written by changedetection.io and the excerpt of
// a change, on the real snapshots of test/fixtures/changedetection/.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_EXCERPT, excerpt, parseRestock, shorten } from '../src/cd/snapshots.js';

const fixture = (name) =>
  readFile(new URL(`./fixtures/changedetection/${name}`, import.meta.url), 'utf8');

test('the restock snapshots of a real changedetection.io 0.60.9', async () => {
  assert.deepEqual(parseRestock(await fixture('snapshot-restock-1.txt')), {
    inStock: false,
    price: 129.9,
  });
  assert.deepEqual(parseRestock(await fixture('snapshot-restock-2.txt')), {
    inStock: true,
    price: 99.9,
  });
});

test('stock or price not detected, and a text that is not a restock snapshot', () => {
  assert.deepEqual(parseRestock('In Stock: None - Price: None'), { inStock: null, price: null });
  assert.deepEqual(parseRestock('In Stock: True - Price: None'), { inStock: true, price: null });
  assert.equal(parseRestock('News\n\nMarket on Saturday'), null);
  assert.equal(parseRestock(''), null);
  assert.equal(parseRestock(undefined), null);
});

test('the excerpt of a real change: the line added', async () => {
  assert.equal(
    excerpt(await fixture('snapshot-text-1.txt'), await fixture('snapshot-text-2.txt')),
    'New bakery opens on the main square',
  );
});

test('the excerpt: removed lines when nothing was added, cut at 200 characters', () => {
  assert.equal(excerpt('A\nB\nC', 'A\nC'), '− B');
  assert.equal(excerpt('A', 'A'), '');
  assert.equal(excerpt(null, 'First\nSecond'), 'First · Second');
  const long = excerpt('', Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '));
  assert.ok(long.length <= MAX_EXCERPT);
  assert.ok(long.endsWith('…'));
  assert.equal(shorten('short', 10), 'short');
});
