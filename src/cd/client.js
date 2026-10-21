// -----------------------------------------------------------------------------
// changedetection.io client: the REST API of changedetection.io (`/api/v1`),
// authenticated by the `x-api-key` header (Settings → API). Checked against a
// real changedetection.io 0.60.9 (test/fixtures/changedetection/).
//
// What the integration reads, and why:
//   - GET /api/v1/watch: every watch in one request (last change, last check,
//     last error, viewed, titles, URL, tags) — read at every cycle;
//   - GET /api/v1/watch/<uuid>: the processor of a watch ("restock_diff" for
//     price and stock), read once per watch;
//   - GET /api/v1/watch/<uuid>/history and /history/<timestamp>: the snapshots,
//     read only after a change, for the excerpt and the price/stock;
//   - GET /api/v1/tags, /api/v1/systeminfo: tag names, version.
// And what it writes, on the user's request only:
//   - GET /api/v1/watch/<uuid>?recheck=1, /api/v1/watch?recheck_all=1;
//   - PUT /api/v1/watch/<uuid> { last_viewed }: "mark as viewed", the field
//     the web interface sets when the difference page is opened.
//
// The watch detail of 0.60.9 does not expose the `restock` object (it is in
// SYSTEM_MANAGED_NON_SPEC_FIELDS): price and stock come from the snapshot of
// the restock processor, "In Stock: True - Price: 99.9" (src/cd/snapshots.js).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // API key refused
  KEY_MISSING: 'key_missing', // changedetection.io asks for a key and none is configured
  NOT_CD: 'not_cd', // something answers, not changedetection.io
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class CdError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CdError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// A watch uuid, as changedetection.io writes it (also what keeps a path safe).
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const seconds = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * One entry of GET /api/v1/watch, normalized.
 * `lastChanged` stays 0 until a second snapshot differs from the first.
 */
export function normalizeWatch(uuid, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const lastChanged = seconds(source.last_changed);
  return {
    uuid,
    title: text(source.title),
    pageTitle: text(source.page_title),
    url: text(source.url) ?? '',
    link: text(source.link) ?? text(source.url) ?? '',
    lastChanged,
    lastChecked: seconds(source.last_checked),
    // `last_error` is false, or the message of the last failed check.
    error: text(source.last_error),
    viewed: source.viewed === true,
    // "Not viewed" only means something once a change exists (`last_changed`
    // is 0 with a single snapshot, and `viewed` false all the same).
    unviewed: lastChanged > 0 && source.viewed !== true,
    tags: Array.isArray(source.tags) ? source.tags.filter((tag) => typeof tag === 'string') : [],
  };
}

export class CdClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.apiKey] API key, '' for none
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, apiKey = '', insecure = false, request = httpRequest, timeoutMs = 15_000 }) {
    this.url = url;
    this.apiKey = apiKey;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  /**
   * @returns {Promise<{ status: number, body: string }>} a 2xx answer
   * @throws {CdError}
   */
  async call(path, { method = 'GET', json } = {}) {
    const headers = { accept: 'application/json' };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    let body;
    if (json !== undefined) {
      body = JSON.stringify(json);
      headers['content-type'] = 'application/json';
    }
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        headers,
        body,
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new CdError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new CdError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status } = response;
    if (status === 401 || status === 403) {
      throw this.apiKey
        ? new CdError(ERROR_KINDS.AUTH, `API key refused (HTTP ${status})`, { status })
        : new CdError(ERROR_KINDS.KEY_MISSING, `An API key is needed (HTTP ${status})`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new CdError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new CdError(ERROR_KINDS.NOT_CD, `Not found (HTTP 404) on ${path.split('?')[0]}`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new CdError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
    return response;
  }

  async json(path) {
    const { body } = await this.call(path);
    try {
      return JSON.parse(body);
    } catch {
      // An HTML page: another service, or the web interface of changedetection.io
      // in front of an older version without this API.
      throw new CdError(ERROR_KINDS.NOT_CD, 'The answer is not changedetection.io JSON');
    }
  }

  /** Every watch, in the order of the API. */
  async watches() {
    const data = await this.json('/api/v1/watch');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new CdError(ERROR_KINDS.NOT_CD, 'The watch list is not an object');
    }
    return Object.entries(data)
      .filter(([uuid]) => UUID.test(uuid))
      .map(([uuid, raw]) => normalizeWatch(uuid, raw));
  }

  /** @returns {Promise<{ version: string|null, watchCount: number|null }>} */
  async systemInfo() {
    const data = await this.json('/api/v1/systeminfo');
    return {
      version: text(data?.version),
      watchCount: Number.isFinite(data?.watch_count) ? data.watch_count : null,
    };
  }

  /** @returns {Promise<Map<string, string>>} tag names by uuid */
  async tags() {
    const data = await this.json('/api/v1/tags');
    const names = new Map();
    for (const [uuid, tag] of Object.entries(data && typeof data === 'object' ? data : {})) {
      const title = text(tag?.title);
      if (title) {
        names.set(uuid, title);
      }
    }
    return names;
  }

  /** The processor of a watch: "text_json_diff" (default) or "restock_diff". */
  async processor(uuid) {
    const data = await this.json(`/api/v1/watch/${encodeURIComponent(uuid)}`);
    return text(data?.processor) ?? 'text_json_diff';
  }

  /** The snapshot timestamps of a watch, oldest first (strings, as the API keys them). */
  async history(uuid) {
    const data = await this.json(`/api/v1/watch/${encodeURIComponent(uuid)}/history`);
    return Object.keys(data && typeof data === 'object' ? data : {})
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));
  }

  /** The text of one snapshot (`latest` for the newest). */
  async snapshot(uuid, timestamp) {
    const { body } = await this.call(
      `/api/v1/watch/${encodeURIComponent(uuid)}/history/${encodeURIComponent(timestamp)}`,
    );
    return body;
  }

  async recheck(uuid) {
    await this.call(`/api/v1/watch/${encodeURIComponent(uuid)}?recheck=1`);
  }

  async recheckAll() {
    await this.call('/api/v1/watch?recheck_all=1');
  }

  /** "Mark as viewed": what the web interface does when the difference is opened. */
  async markViewed(uuid, atSeconds) {
    await this.call(`/api/v1/watch/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      json: { last_viewed: Math.floor(atSeconds) },
    });
  }
}
