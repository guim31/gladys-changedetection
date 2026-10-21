// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds. One request per
// cycle (the watch list), plus a few after a change: changedetection.io checks
// a page every three hours by default, a minute is already quick.
export const POLL_INTERVALS = ['30', '60', '120', '300', '900'];

// Units of the price feature (Gladys units), set when a device is added:
// changedetection.io gives the price without its currency in the snapshot.
export const CURRENCIES = ['euro', 'dollar', 'pound-sterling', 'none'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  poll_interval: '60',
  currency: 'euro',
  allow_self_signed: false,
  language: 'fr',
};

// Pages of the changedetection.io interface: a URL copied from the browser
// points at one of them, the API lives at the root.
const INTERFACE_PATH =
  /\/(settings|edit|diff|preview|tags|imports?|api|backups?|login|rss)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:5000`), or a URL copied from the browser
 * (`https://cd.example.com/edit/<uuid>`). HTTP by default. A path is kept
 * (behind a reverse proxy sub-path), the interface pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseInstanceUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const value = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const chosen = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(chosen) ? chosen : DEFAULT_CONFIG[key];
  };
  const typed = value('url');
  const url = typed ? parseInstanceUrl(typed) : null;
  const currency = pick('currency', CURRENCIES);
  return {
    url,
    invalidUrl: Boolean(typed) && url === null,
    // A pasted key often carries a trailing space or new line.
    apiKey: value('api_key'),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    currency: currency === 'none' ? null : currency,
    allowSelfSigned: source.allow_self_signed === true || source.allow_self_signed === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
