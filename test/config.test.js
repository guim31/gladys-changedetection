// -----------------------------------------------------------------------------
// Configuration normalization: address forms, defaults, choices.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseInstanceUrl } from '../src/config.js';

test('the address: bare host, copied from the browser, sub-path, refused forms', () => {
  assert.equal(parseInstanceUrl('192.0.2.10:5000'), 'http://192.0.2.10:5000');
  assert.equal(parseInstanceUrl(' https://cd.example.com/ '), 'https://cd.example.com');
  assert.equal(
    parseInstanceUrl('https://cd.example.com/edit/5ab70fa1-97c7-41c1-a9fe-618627bd640d'),
    'https://cd.example.com',
  );
  assert.equal(
    parseInstanceUrl('https://example.com/changedetection/settings'),
    'https://example.com/changedetection',
  );
  assert.equal(
    parseInstanceUrl('https://example.com/changedetection/'),
    'https://example.com/changedetection',
  );
  assert.equal(parseInstanceUrl('ftp://example.com'), null);
  assert.equal(parseInstanceUrl('http://user:pass@example.com'), null);
  assert.equal(parseInstanceUrl(''), null);
  assert.equal(parseInstanceUrl(42), null);
});

test('defaults, and values out of the lists', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    invalidUrl: false,
    apiKey: '',
    pollIntervalMs: 60_000,
    currency: 'euro',
    allowSelfSigned: false,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'nope nope',
    api_key: ' key\n',
    poll_interval: '7',
    currency: 'none',
    allow_self_signed: 'true',
    language: 'it',
  });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.apiKey, 'key');
  assert.equal(config.pollIntervalMs, Number(DEFAULT_CONFIG.poll_interval) * 1000);
  assert.equal(config.currency, null);
  assert.equal(config.allowSelfSigned, true);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: 900 }).pollIntervalMs, 900_000);
});
