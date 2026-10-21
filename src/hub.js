// -----------------------------------------------------------------------------
// The changedetection.io hub: the watch list read on a timer of the container
// (the interval chosen in the configuration); the states published to Gladys
// when they change, the scene events fired on what happened since the last
// read, and the views the widget and the scene actions read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 15 minutes, beyond the fixed list of the core scheduler, and the scene
// events fire for every watch, added to Gladys or not — "a page changed" is
// what spares the user one scene per watch.
//
// What was last seen of each watch is kept in /data (src/store.js): a page that
// changed while the integration or Gladys restarted is still announced, once.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildServerDevice,
  buildWatchDevice,
  isServerId,
  parseWatchId,
  serverIds,
  serverValues,
  watchIds,
  watchName,
  watchValues,
} from './devices.js';
import { CdClient } from './cd/client.js';
import { excerpt, parseRestock } from './cd/snapshots.js';
import { ProblemLog } from './problems.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, pick } from './texts.js';

const logger = createLogger({ name: 'changedetection-hub' });

export const WIDGET_KEY = 'latest_changes';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  CHANGED: 'page_changed',
  PRICE_DROP: 'price_dropped',
  BACK_IN_STOCK: 'back_in_stock',
  ERROR: 'watch_error',
});

export const RESTOCK_PROCESSOR = 'restock_diff';

export const HUB_TIMINGS = {
  // After "Check now", changedetection.io needs a few seconds per page: read
  // again this soon to pick the result up.
  recheckReadMs: 20_000,
  // Every state is published again this often, even unchanged: Gladys shows
  // "no recent value" after 48 hours without one.
  heartbeatMs: 12 * 3600_000,
};

const MAX_STATES_PER_REQUEST = 100;
const MAX_TRANSPORTS_PER_REQUEST = 100;

const signature = (config) => JSON.stringify([config.url, config.apiKey, config.allowSelfSigned]);

/** A state in the publishStates format: a number, or `{ text }`. */
const toState = (externalId, value) =>
  typeof value === 'number'
    ? { device_feature_external_id: externalId, state: value }
    : { device_feature_external_id: externalId, text: value.text };
const stateKey = (value) => (typeof value === 'number' ? `n:${value}` : `t:${value.text}`);

export class CdHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/cd/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.signature = null;
    this.client = null;
    /** @type {Map<string, object>} the watches of the last read, by uuid */
    this.watches = new Map();
    /** @type {Map<string, string>} tag names by uuid */
    this.tagNames = new Map();
    this.version = null;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    /** Last value published per feature external id, and when. */
    this.published = new Map();
    this.publishedAt = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = { watches: {} };
    this.pollTimer = null;
    this.soonTimer = null;
    this.stopped = false;
    // What fails again at every reading cycle: one line when it starts, one
    // when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const watches = saved?.watches;
    this.saved = { watches: watches && typeof watches === 'object' ? watches : {} };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.publishedAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.config && this.config.language !== config.language;
    const currencyChanged = this.config && this.config.currency !== config.currency;
    this.config = config;
    const next = config.url ? signature(config) : null;
    if (next !== this.signature) {
      this.signature = next;
      this.client = config.url
        ? new CdClient({
            url: config.url,
            apiKey: config.apiKey,
            insecure: config.allowSelfSigned,
            request: this.request,
          })
        : null;
      this.watches = new Map();
      this.tagNames = new Map();
      this.version = null;
      this.readAt = 0;
      this.error = null;
    }
    if (languageChanged || currencyChanged) {
      this.discovered = null;
      this.published.clear(); // the texts follow the language
    }
    await this.pollNow({ publish: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.soonTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading changedetection.io works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read again in a few seconds (after "Check now"), on top of the usual timer. */
  readSoon() {
    clearTimeout(this.soonTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.soonTimer = setTimeout(() => {
      this.pollNow().catch((err) => logger.warn(`Read after a check failed: ${err.message}`));
    }, this.timings.recheckReadMs);
    this.soonTimer.unref?.();
  }

  // --- Identities --------------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  // --- Devices ---------------------------------------------------------------

  discoveredDevices() {
    if (this.readAt === 0) {
      return [];
    }
    const options = { language: this.config.language, currency: this.config.currency };
    return [
      buildServerDevice(this.gladys, options),
      ...[...this.watches.values()].map((watch) => buildWatchDevice(this.gladys, watch, options)),
    ];
  }

  /** Publish the Discovery list when it changed (a watch added, renamed…). */
  async publishDevices({ force = false } = {}) {
    if (!this.client || (this.readAt === 0 && !force)) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale watch.
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read again, publish the list again. */
  async rediscover() {
    await this.pollNow();
    await this.publishDevices({ force: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (isServerId(this.gladys, device.external_id)) {
      await this.publishServerStates({ force: true });
    } else {
      const watch = this.watches.get(parseWatchId(this.gladys, device.external_id));
      if (!watch) {
        return;
      }
      await this.publishWatchStates(watch, { force: true });
    }
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading changedetection.io --------------------------------------------------

  /**
   * Read the watches and apply what changed. Concurrent calls share the read.
   * @returns {Promise<void>}
   */
  pollNow({ publish = false } = {}) {
    if (!this.client) {
      return this.afterChanges(false, { publish });
    }
    const client = this.client;
    this.polling ??= this.read(client).finally(() => {
      this.polling = null;
    });
    return this.polling.then((changed) => this.afterChanges(changed, { publish }));
  }

  /** @returns {Promise<boolean>} whether the widget shows something new */
  async read(client) {
    let watches;
    try {
      watches = await client.watches();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return this.applyFailure(client, err);
    }
    return this.applySuccess(client, watches);
  }

  async applyFailure(client, err) {
    if (client !== this.client) {
      return false; // reconfigured meanwhile
    }
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.readAt === 0) {
      this.readAt = -1; // tried: the connection status may be published
    }
    if (wasError !== err.kind) {
      logger.warn(`changedetection.io: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  async applySuccess(client, list) {
    if (client !== this.client) {
      return false;
    }
    let widgetChanged = this.error !== null || this.readAt <= 0;
    if (this.error) {
      logger.info('changedetection.io answers again');
    }
    if (this.readAt <= 0) {
      try {
        this.version = (await client.systemInfo()).version;
      } catch (err) {
        logger.debug(`System info unavailable: ${err.message}`);
      }
      logger.info(
        `Connected to changedetection.io${this.version ? ` ${this.version}` : ''}, ${list.length} watch(es)`,
      );
    }
    this.error = null;
    this.readAt = this.now();

    if (list.some((watch) => watch.tags.some((tag) => !this.tagNames.has(tag)))) {
      try {
        this.tagNames = await client.tags();
      } catch (err) {
        logger.debug(`Tags unavailable: ${err.message}`);
      }
    }

    const next = new Map();
    for (const raw of list) {
      const watch = await this.update(client, raw);
      if (client !== this.client) {
        return false;
      }
      const previous = this.watches.get(watch.uuid);
      if (
        !previous ||
        previous.lastChanged !== watch.lastChanged ||
        previous.unviewed !== watch.unviewed ||
        previous.error !== watch.error ||
        watchName(previous) !== watchName(watch)
      ) {
        widgetChanged = true;
      }
      next.set(watch.uuid, watch);
    }
    for (const uuid of this.watches.keys()) {
      if (!next.has(uuid)) {
        widgetChanged = true; // deleted
      }
    }
    for (const uuid of Object.keys(this.saved.watches)) {
      if (!next.has(uuid)) {
        delete this.saved.watches[uuid];
      }
    }
    this.watches = next;
    this.store.save(this.saved);

    for (const watch of next.values()) {
      await this.publishWatchStates(watch);
    }
    await this.publishServerStates();
    return widgetChanged;
  }

  /**
   * Compare a watch with what was last seen of it: read its snapshots when it
   * changed, fire the scene events.
   * @returns {Promise<object>} the watch, with processor, price, stock, excerpt
   */
  async update(client, raw) {
    const before = this.saved.watches[raw.uuid];
    const entry = { ...before };
    const watch = { ...raw };

    if (!entry.processor) {
      try {
        entry.processor = await client.processor(watch.uuid);
      } catch (err) {
        logger.debug(`Processor of ${watch.uuid} unavailable: ${err.message}`);
      }
    }
    watch.restock = entry.processor === RESTOCK_PROCESSOR;

    const changed = before !== undefined && watch.lastChanged > (before.lastChanged ?? 0);
    // The price and stock of a restock watch not read yet (first time seen,
    // or no snapshot until now) come from its latest snapshot.
    const needsStock =
      watch.restock &&
      (changed ||
        entry.inStock === undefined ||
        (entry.inStock === null &&
          entry.price === null &&
          watch.lastChecked !== before?.lastChecked));

    let snapshots = null;
    if (changed || needsStock) {
      snapshots = await this.readSnapshots(client, watch.uuid, { previous: changed });
    }
    if (watch.restock && snapshots?.latest !== undefined) {
      const stock = parseRestock(snapshots.latest);
      entry.inStock = stock?.inStock ?? null;
      entry.price = stock?.price ?? null;
    } else if (watch.restock && entry.inStock === undefined && snapshots) {
      entry.inStock = null; // no snapshot yet
      entry.price = null;
    }
    if (changed && snapshots?.latest !== undefined) {
      entry.excerpt = excerpt(snapshots.previous ?? null, snapshots.latest) || null;
    }

    watch.price = entry.price ?? null;
    watch.inStock = entry.inStock ?? null;
    watch.excerpt = entry.excerpt ?? null;
    watch.tagNames = watch.tags.map((tag) => this.tagNames.get(tag)).filter(Boolean);

    entry.lastChanged = watch.lastChanged;
    entry.lastChecked = watch.lastChecked;
    entry.error = Boolean(watch.error);
    this.saved.watches[watch.uuid] = entry;

    if (before !== undefined) {
      await this.fireEvents(watch, before, changed);
    }
    return watch;
  }

  /**
   * The latest snapshot of a watch, and the one before when asked.
   * @returns {Promise<{ latest?: string, previous?: string }|null>} null: no history
   */
  async readSnapshots(client, uuid, { previous }) {
    try {
      const keys = await client.history(uuid);
      if (keys.length === 0) {
        return {};
      }
      const result = { latest: await client.snapshot(uuid, keys.at(-1)) };
      if (previous && keys.length > 1) {
        result.previous = await client.snapshot(uuid, keys.at(-2));
      }
      return result;
    } catch (err) {
      logger.debug(`Snapshots of ${uuid} unavailable: ${err.message}`);
      return null;
    }
  }

  async fireEvents(watch, before, changed) {
    const name = watchName(watch);
    if (changed) {
      logger.info(`"${name}" changed`);
      await this.fireWatch(TRIGGERS.CHANGED, watch, { excerpt: watch.excerpt ?? '' });
    }
    if (watch.restock && changed) {
      const was = typeof before.price === 'number' ? before.price : null;
      if (was !== null && watch.price !== null && watch.price < was) {
        logger.info(`"${name}": price ${was} → ${watch.price}`);
        await this.fireWatch(TRIGGERS.PRICE_DROP, watch, {
          price: watch.price,
          previous_price: was,
        });
      }
      if (before.inStock === false && watch.inStock === true) {
        logger.info(`"${name}" is back in stock`);
        await this.fireWatch(
          TRIGGERS.BACK_IN_STOCK,
          watch,
          watch.price === null ? {} : { price: watch.price },
        );
      }
    }
    if (!before.error && watch.error) {
      logger.info(`"${name}" is in error`);
      await this.fireWatch(TRIGGERS.ERROR, watch, { error: watch.error.slice(0, 500) });
    }
  }

  fireWatch(key, watch, extra = {}) {
    return this.fireEvent(key, {
      device: watchIds(this.gladys, watch.uuid).device,
      title: watchName(watch).slice(0, 500),
      url: watch.url.slice(0, 1000),
      tags: watch.tagNames.join(', ').slice(0, 500),
      ...extra,
    });
  }

  async fireEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishValues(entries, { force = false } = {}) {
    const now = this.now();
    const states = [];
    for (const { externalId, value } of entries) {
      if (value === null) {
        continue;
      }
      const stale = now - (this.publishedAt.get(externalId) ?? 0) >= this.timings.heartbeatMs;
      if (!force && !stale && this.published.get(externalId) === stateKey(value)) {
        continue;
      }
      states.push(toState(externalId, value));
    }
    await this.sendStates(states);
  }

  /** The states of one watch, when the user added its device. */
  async publishWatchStates(watch, options) {
    if (!this.isCreated(watchIds(this.gladys, watch.uuid).device)) {
      return; // Gladys drops the states of a device not added
    }
    await this.publishValues(watchValues(this.gladys, watch, this.config.language), options);
  }

  async publishServerStates(options) {
    if (this.readAt <= 0 || !this.isCreated(serverIds(this.gladys).device)) {
      return;
    }
    await this.publishValues(serverValues(this.gladys, this.watches.values()), options);
  }

  async sendStates(states) {
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        const now = this.now();
        for (const state of batch) {
          const value = state.text === undefined ? state.state : { text: state.text };
          this.published.set(state.device_feature_external_id, stateKey(value));
          this.publishedAt.set(state.device_feature_external_id, now);
        }
        this.problems.recover('states', 'States accepted again');
      } catch (err) {
        this.problems.fail('states', `States refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: "local", or "unreachable". */
  async publishTransports() {
    if (this.readAt === 0 || !this.client) {
      return;
    }
    const transport = this.error === null ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    const entries = [];
    const ids = [
      serverIds(this.gladys).device,
      ...[...this.watches.keys()].map((uuid) => watchIds(this.gladys, uuid).device),
    ];
    for (const externalId of ids) {
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noInstance,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    if (this.client && this.readAt === 0) {
      return; // not read yet
    }
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views and commands (widget, scene actions, report) -------------------------------

  /** The watches of a device selection: a watch, the server (every watch), or none. */
  select(externalId) {
    if (!externalId || isServerId(this.gladys, externalId)) {
      return { all: true, watches: [...this.watches.values()] };
    }
    const uuid = parseWatchId(this.gladys, externalId);
    if (!uuid) {
      throw new Error(pick(ACTION_TEXT.unknownWatch, this.config.language));
    }
    const watch = this.watches.get(uuid) ?? { uuid };
    return { all: false, watches: [watch] };
  }

  /** Throws when changedetection.io cannot be asked anything. */
  assertReady() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noInstance, this.config?.language));
    }
  }

  /** The reason of a failed command, in the configured language. */
  commandError(err) {
    const language = this.config.language;
    return new Error(err.kind ? pick(ERROR_TEXT[err.kind], language) : err.message);
  }

  /**
   * "Check now": changedetection.io checks the page(s) again, the result is
   * read a few seconds later.
   * @returns {Promise<number>} how many watches were queued
   */
  async recheck(externalId) {
    this.assertReady();
    const { all, watches } = this.select(externalId);
    try {
      if (all) {
        await this.client.recheckAll();
      } else {
        await this.client.recheck(watches[0].uuid);
      }
    } catch (err) {
      throw this.commandError(err);
    }
    logger.info(all ? 'Check of every watch requested' : `Check of ${watches[0].uuid} requested`);
    this.readSoon();
    return watches.length;
  }

  /**
   * "Mark as viewed": the change(s) no longer count as new.
   * @returns {Promise<number>} how many watches were marked
   */
  async markViewed(externalId) {
    this.assertReady();
    const { all, watches } = this.select(externalId);
    const targets = all ? watches.filter((watch) => watch.unviewed) : watches;
    const at = Math.floor(this.now() / 1000);
    try {
      for (const watch of targets) {
        await this.client.markViewed(watch.uuid, Math.max(at, watch.lastChanged ?? 0));
      }
    } catch (err) {
      throw this.commandError(err);
    }
    if (targets.length > 0) {
      logger.info(`${targets.length} watch(es) marked as viewed`);
      await this.pollNow();
    }
    return targets.length;
  }

  /** "Test the connection": read now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const status = this.connectionStatus();
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const watches = [...this.watches.values()];
      const parts = [text.ok];
      if (this.version) {
        parts.push(`changedetection.io ${this.version}`);
      }
      parts.push(text.watches(watches.length));
      const errors = watches.filter((watch) => watch.error).length;
      if (errors > 0) {
        parts.push(text.errors(errors));
      }
      const unviewed = watches.filter((watch) => watch.unviewed).length;
      if (unviewed > 0) {
        parts.push(text.unviewed(unviewed));
      }
      message[language] = parts.join(', ');
    }
    return message;
  }

  /** The error of changedetection.io in words, null when it answers. */
  errorText(language) {
    return this.error ? pick(ERROR_TEXT[this.error.kind], language) : null;
  }
}
