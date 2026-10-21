// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab: the user adds the ones to
// follow, nothing is created on their behalf.
//
// - One device per watch, keyed on the watch uuid (permanent in
//   changedetection.io, kept by its backups and imports):
//     - unviewed change: input/binary, 1 while a change was not viewed;
//     - in error: input/binary, 1 while the last check failed;
//     - error message: text/text, the reason of the last failure ("None" else);
//     - last change: text/text, its local date and time;
//     - what changed: text/text, the excerpt of the last change seen by the
//       integration (lines added, or removed);
//     - on a "Re-stock & Price detection" watch only: price (currency/decimal,
//       in the currency of the configuration) and in stock (input/binary).
// - One "changedetection.io" device for the server: watches, watches in
//   error, unviewed changes (counter-sensor/integer).
//
// Published with should_poll: false: the integration reads changedetection.io
// on its own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPES = Object.freeze({ WATCH: 'watch', SERVER: 'server' });
export const SERVER_ID = 'server';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  UNVIEWED: 'unviewed',
  ERROR: 'error',
  ERROR_MESSAGE: 'error_message',
  LAST_CHANGE: 'last_change',
  EXCERPT: 'excerpt',
  PRICE: 'price',
  IN_STOCK: 'in_stock',
  WATCHES: 'watches',
  ERRORS: 'errors',
  UNVIEWED_COUNT: 'unviewed_count',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.UNVIEWED]: 'Unviewed change',
    [FEATURE_KEYS.ERROR]: 'In error',
    [FEATURE_KEYS.ERROR_MESSAGE]: 'Error message',
    [FEATURE_KEYS.LAST_CHANGE]: 'Last change',
    [FEATURE_KEYS.EXCERPT]: 'What changed',
    [FEATURE_KEYS.PRICE]: 'Price',
    [FEATURE_KEYS.IN_STOCK]: 'In stock',
    [FEATURE_KEYS.WATCHES]: 'Watches',
    [FEATURE_KEYS.ERRORS]: 'Watches in error',
    [FEATURE_KEYS.UNVIEWED_COUNT]: 'Unviewed changes',
  },
  fr: {
    [FEATURE_KEYS.UNVIEWED]: 'Changement non vu',
    [FEATURE_KEYS.ERROR]: 'En erreur',
    [FEATURE_KEYS.ERROR_MESSAGE]: "Message d'erreur",
    [FEATURE_KEYS.LAST_CHANGE]: 'Dernier changement',
    [FEATURE_KEYS.EXCERPT]: 'Ce qui a changé',
    [FEATURE_KEYS.PRICE]: 'Prix',
    [FEATURE_KEYS.IN_STOCK]: 'En stock',
    [FEATURE_KEYS.WATCHES]: 'Surveillances',
    [FEATURE_KEYS.ERRORS]: 'Surveillances en erreur',
    [FEATURE_KEYS.UNVIEWED_COUNT]: 'Changements non vus',
  },
  de: {
    [FEATURE_KEYS.UNVIEWED]: 'Ungesehene Änderung',
    [FEATURE_KEYS.ERROR]: 'Fehlerhaft',
    [FEATURE_KEYS.ERROR_MESSAGE]: 'Fehlermeldung',
    [FEATURE_KEYS.LAST_CHANGE]: 'Letzte Änderung',
    [FEATURE_KEYS.EXCERPT]: 'Was sich geändert hat',
    [FEATURE_KEYS.PRICE]: 'Preis',
    [FEATURE_KEYS.IN_STOCK]: 'Auf Lager',
    [FEATURE_KEYS.WATCHES]: 'Überwachungen',
    [FEATURE_KEYS.ERRORS]: 'Fehlerhafte Überwachungen',
    [FEATURE_KEYS.UNVIEWED_COUNT]: 'Ungesehene Änderungen',
  },
  es: {
    [FEATURE_KEYS.UNVIEWED]: 'Cambio no visto',
    [FEATURE_KEYS.ERROR]: 'Con error',
    [FEATURE_KEYS.ERROR_MESSAGE]: 'Mensaje de error',
    [FEATURE_KEYS.LAST_CHANGE]: 'Último cambio',
    [FEATURE_KEYS.EXCERPT]: 'Qué ha cambiado',
    [FEATURE_KEYS.PRICE]: 'Precio',
    [FEATURE_KEYS.IN_STOCK]: 'En stock',
    [FEATURE_KEYS.WATCHES]: 'Vigilancias',
    [FEATURE_KEYS.ERRORS]: 'Vigilancias con error',
    [FEATURE_KEYS.UNVIEWED_COUNT]: 'Cambios no vistos',
  },
};

// The text of "Error message" while the watch has none (a text state is never empty).
export const NO_ERROR = { en: 'None', fr: 'Aucune', de: 'Keiner', es: 'Ninguno' };

export const MODEL = 'changedetection.io';
export const SERVER_NAME = 'changedetection.io';
export const PARAMS = Object.freeze({ URL: 'WATCH_URL' });

// Display bounds (the core never applies them on write).
export const MAX_PRICE = 1_000_000;
export const MAX_COUNT = 100_000;
// A text state, at most (Gladys stores it in a string column).
export const MAX_TEXT = 200;

export const watchIds = (gladys, uuid) => gladys.externalIds(DEVICE_TYPES.WATCH, uuid);
export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPES.SERVER, SERVER_ID);

/** The uuid of a watch device external id, null when it is not one. */
export function parseWatchId(gladys, externalId) {
  const prefix = watchIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const uuid = externalId.slice(prefix.length);
  return /^[0-9a-f-]{36}$/i.test(uuid) ? uuid : null;
}

export const isServerId = (gladys, externalId) => externalId === serverIds(gladys).device;

/** The name of a watch: its title in changedetection.io, the page title, or its address. */
export function watchName(watch) {
  return watch.title ?? watch.pageTitle ?? (watch.url.replace(/^https?:\/\//i, '') || watch.uuid);
}

const sensor = (names, ids, key, extra) => ({
  name: names[key],
  external_id: ids.feature(key),
  read_only: true,
  has_feedback: false,
  ...extra,
});

const binary = (names, ids, key) =>
  sensor(names, ids, key, {
    category: DEVICE_FEATURE_CATEGORIES.INPUT,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    keep_history: true,
    min: 0,
    max: 1,
  });

const textFeature = (names, ids, key) =>
  sensor(names, ids, key, {
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: false,
    // min and max are NOT NULL in Gladys, text features included.
    min: 0,
    max: 0,
  });

/**
 * The discovery payload of a watch.
 * @param {object} gladys SDK client
 * @param {object} watch see src/cd/client.js, with `restock` (boolean)
 * @param {{ language: string, currency: string|null }} options
 */
export function buildWatchDevice(gladys, watch, { language = 'en', currency = null } = {}) {
  const ids = watchIds(gladys, watch.uuid);
  const names = NAMES[language] ?? NAMES.en;
  const features = [
    binary(names, ids, FEATURE_KEYS.UNVIEWED),
    binary(names, ids, FEATURE_KEYS.ERROR),
    textFeature(names, ids, FEATURE_KEYS.ERROR_MESSAGE),
    textFeature(names, ids, FEATURE_KEYS.LAST_CHANGE),
    textFeature(names, ids, FEATURE_KEYS.EXCERPT),
  ];
  if (watch.restock) {
    features.push(
      sensor(names, ids, FEATURE_KEYS.PRICE, {
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        ...(currency ? { unit: currency } : {}),
        keep_history: true,
        min: 0,
        max: MAX_PRICE,
      }),
      binary(names, ids, FEATURE_KEYS.IN_STOCK),
    );
  }
  return {
    name: watchName(watch).slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: watch.url ? [{ name: PARAMS.URL, value: watch.url.slice(0, 255) }] : [],
    features,
  };
}

/** The discovery payload of the server device. */
export function buildServerDevice(gladys, { language = 'en' } = {}) {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  const counter = (key) =>
    sensor(names, ids, key, {
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      keep_history: true,
      min: 0,
      max: MAX_COUNT,
    });
  return {
    name: SERVER_NAME,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    features: [
      counter(FEATURE_KEYS.WATCHES),
      counter(FEATURE_KEYS.ERRORS),
      counter(FEATURE_KEYS.UNVIEWED_COUNT),
    ],
  };
}

/**
 * The local date and time of a change, in the language of the configuration
 * (Gladys gives the container its time zone in TZ).
 */
export function formatDate(seconds, language) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(seconds * 1000));
}

const clip = (value) => (value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT - 1)}…` : value);

/**
 * The value of every feature of a watch (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|{ text: string }|null }>}
 */
export function watchValues(gladys, watch, language) {
  const ids = watchIds(gladys, watch.uuid);
  const values = [
    { key: FEATURE_KEYS.UNVIEWED, value: watch.unviewed ? 1 : 0 },
    { key: FEATURE_KEYS.ERROR, value: watch.error ? 1 : 0 },
    {
      key: FEATURE_KEYS.ERROR_MESSAGE,
      value: { text: clip(watch.error ?? NO_ERROR[language] ?? NO_ERROR.en) },
    },
    {
      key: FEATURE_KEYS.LAST_CHANGE,
      value: watch.lastChanged > 0 ? { text: formatDate(watch.lastChanged, language) } : null,
    },
    { key: FEATURE_KEYS.EXCERPT, value: watch.excerpt ? { text: clip(watch.excerpt) } : null },
  ];
  if (watch.restock) {
    values.push(
      { key: FEATURE_KEYS.PRICE, value: watch.price ?? null },
      {
        key: FEATURE_KEYS.IN_STOCK,
        value: watch.inStock === true ? 1 : watch.inStock === false ? 0 : null,
      },
    );
  }
  return values.map((entry) => ({ ...entry, externalId: ids.feature(entry.key) }));
}

/** The values of the server device. */
export function serverValues(gladys, watches) {
  const ids = serverIds(gladys);
  const list = [...watches];
  return [
    { key: FEATURE_KEYS.WATCHES, value: list.length },
    { key: FEATURE_KEYS.ERRORS, value: list.filter((watch) => watch.error).length },
    { key: FEATURE_KEYS.UNVIEWED_COUNT, value: list.filter((watch) => watch.unviewed).length },
  ].map((entry) => ({ ...entry, externalId: ids.feature(entry.key) }));
}
