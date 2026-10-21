// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, an in-memory changedetection.io,
// a temporary /data and a manual clock, with the integration wired on top
// through registerHandlers. No timer runs: the tests read changedetection.io
// with `world.hub.pollNow()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { serverIds, watchIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { API_KEY, FakeChangedetection, TAG_SHOPPING, UUIDS, watch } from './fakeChangedetection.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const CD_URL = 'http://192.0.2.10:5000';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 21, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {FakeChangedetection} [options.cd]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  cd = new FakeChangedetection(),
  config = { url: CD_URL, api_key: API_KEY, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-changedetection-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: (url, options) => cd.request(url, options),
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, cd, app, hub: app.hub, clock, dataDir };
}

export const deviceId = (gladys, uuid) => watchIds(gladys, uuid).device;
export const featureId = (gladys, uuid, feature) => watchIds(gladys, uuid).feature(feature);
export const serverFeatureId = (gladys, feature) => serverIds(gladys).feature(feature);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, FakeChangedetection, TAG_SHOPPING, UUIDS, watch };
