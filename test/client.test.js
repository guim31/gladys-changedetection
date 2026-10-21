// -----------------------------------------------------------------------------
// The client against the real answers of changedetection.io 0.60.9
// (test/fixtures/changedetection/), and its errors by kind.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CdClient, ERROR_KINDS } from '../src/cd/client.js';

const fixture = (name) =>
  readFile(new URL(`./fixtures/changedetection/${name}`, import.meta.url), 'utf8');

function clientFor(routes, calls = []) {
  return new CdClient({
    url: 'http://192.0.2.10:5000',
    apiKey: 'k',
    request: async (url, options) => {
      calls.push({ url, ...options });
      const path = new URL(url).pathname + new URL(url).search;
      const body = routes[path];
      if (body === undefined) {
        return { status: 404, headers: {}, body: '{"message": "not found"}' };
      }
      return { status: 200, headers: {}, body };
    },
  });
}

test('the watch list of a real changedetection.io', async () => {
  const calls = [];
  const client = clientFor({ '/api/v1/watch': await fixture('watch-list.json') }, calls);
  const watches = await client.watches();
  assert.equal(calls[0].headers['x-api-key'], 'k');
  assert.deepEqual(
    watches.map((w) => [w.title ?? w.pageTitle, w.lastChanged, w.unviewed, Boolean(w.error)]),
    [
      ['Coffee grinder', 1792569056, true, false],
      ['Broken page', 0, false, true],
      ['Village news', 1792569056, false, false], // marked as viewed through the API
    ],
  );
  assert.deepEqual(watches[0].tags, ['bd701501-5d7e-44d9-a98a-c0c838bb32f8']);
  assert.equal(watches[1].error, 'Error - 500 (Internal server error) received from the web site');
});

test('system info, tags, processor and history of a real changedetection.io', async () => {
  const uuid = 'a335064b-2ed7-4d8f-980e-31145c0ffa1a';
  const news = '5ab70fa1-97c7-41c1-a9fe-618627bd640d';
  const client = clientFor({
    '/api/v1/systeminfo': await fixture('systeminfo.json'),
    '/api/v1/tags': await fixture('tags.json'),
    [`/api/v1/watch/${uuid}`]: await fixture('watch-detail-restock.json'),
    [`/api/v1/watch/${news}`]: await fixture('watch-detail-text.json'),
    [`/api/v1/watch/${news}/history`]: await fixture('history-text.json'),
  });
  assert.deepEqual(await client.systemInfo(), { version: '0.60.9', watchCount: 3 });
  assert.equal((await client.tags()).get('bd701501-5d7e-44d9-a98a-c0c838bb32f8'), 'Shopping');
  assert.equal(await client.processor(uuid), 'restock_diff');
  assert.equal(await client.processor(news), 'text_json_diff');
  assert.deepEqual(await client.history(news), ['1792569014', '1792569056']);
});

test('recheck and mark as viewed: the requests changedetection.io expects', async () => {
  const calls = [];
  const client = new CdClient({
    url: 'https://cd.example.com/sub',
    apiKey: 'k',
    request: async (url, options) => {
      calls.push([options.method, url, options.body]);
      return { status: 200, headers: {}, body: '"OK"' };
    },
  });
  await client.recheck('5ab70fa1-97c7-41c1-a9fe-618627bd640d');
  await client.recheckAll();
  await client.markViewed('5ab70fa1-97c7-41c1-a9fe-618627bd640d', 1792569100.7);
  assert.deepEqual(calls, [
    [
      'GET',
      'https://cd.example.com/sub/api/v1/watch/5ab70fa1-97c7-41c1-a9fe-618627bd640d?recheck=1',
      undefined,
    ],
    ['GET', 'https://cd.example.com/sub/api/v1/watch?recheck_all=1', undefined],
    [
      'PUT',
      'https://cd.example.com/sub/api/v1/watch/5ab70fa1-97c7-41c1-a9fe-618627bd640d',
      '{"last_viewed":1792569100}',
    ],
  ]);
});

test('the errors, by kind, never with the key', async () => {
  const cases = [
    [
      { status: 403, body: '"Invalid access - API key invalid."' },
      'secret-key-123',
      ERROR_KINDS.AUTH,
    ],
    [{ status: 403, body: '"Invalid access - API key invalid."' }, '', ERROR_KINDS.KEY_MISSING],
    [{ status: 301, body: '' }, 'k', ERROR_KINDS.REDIRECT],
    [{ status: 404, body: '' }, 'k', ERROR_KINDS.NOT_CD],
    [{ status: 200, body: '<!DOCTYPE html>' }, 'k', ERROR_KINDS.NOT_CD],
    [{ status: 500, body: '' }, 'k', ERROR_KINDS.HTTP],
    [{ code: 'ECONNREFUSED' }, 'k', ERROR_KINDS.UNREACHABLE],
    [{ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, 'k', ERROR_KINDS.TLS],
  ];
  for (const [answer, apiKey, kind] of cases) {
    const client = new CdClient({
      url: 'http://192.0.2.10:5000',
      apiKey,
      request: async () => {
        if (answer.code) {
          throw Object.assign(new Error('boom'), { code: answer.code });
        }
        return { headers: {}, ...answer };
      },
    });
    await assert.rejects(client.watches(), (err) => {
      assert.equal(err.kind, kind);
      assert.ok(!err.message.includes(apiKey || 'never'));
      return true;
    });
  }
});
