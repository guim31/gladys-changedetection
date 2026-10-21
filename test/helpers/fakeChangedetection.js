// -----------------------------------------------------------------------------
// An in-memory changedetection.io, answering the routes of its REST API the way
// changedetection.io 0.60.9 does (the shapes of test/fixtures/changedetection/):
// watch list, watch detail, history, snapshots, tags, system info, recheck and
// PUT last_viewed. `failure` simulates a server down, a refused key, etc.
// -----------------------------------------------------------------------------

export const API_KEY = 'cd-test-key';

export const UUIDS = {
  news: '5ab70fa1-97c7-41c1-a9fe-618627bd640d',
  shop: 'a335064b-2ed7-4d8f-980e-31145c0ffa1a',
  broken: '7bf48e3b-1dd7-4384-b6c0-eb1a4fa405f7',
};

export const TAG_SHOPPING = 'bd701501-5d7e-44d9-a98a-c0c838bb32f8';

/** A watch as the fake stores it. */
export function watch({
  uuid,
  url = 'https://example.com/',
  title = null,
  pageTitle = null,
  processor = 'text_json_diff',
  snapshots = [],
  error = false,
  lastViewed = 0,
  tags = [],
  lastChecked = 1792569014,
}) {
  return {
    uuid,
    url,
    title,
    pageTitle,
    processor,
    snapshots,
    error,
    lastViewed,
    tags,
    lastChecked,
  };
}

/** The three watches of the real instance the fixtures come from. */
export function defaultWatches() {
  return [
    watch({
      uuid: UUIDS.news,
      url: 'https://news.example.org/village',
      title: 'Village news',
      pageTitle: 'Village news',
      snapshots: [{ at: 1792569014, text: 'News\n\nMarket on Saturday' }],
    }),
    watch({
      uuid: UUIDS.shop,
      url: 'https://shop.example.com/coffee-grinder',
      pageTitle: 'Coffee grinder',
      processor: 'restock_diff',
      tags: [TAG_SHOPPING],
      snapshots: [{ at: 1792569014, text: 'In Stock: False - Price: 129.9' }],
    }),
    watch({
      uuid: UUIDS.broken,
      url: 'https://broken.example.net/',
      title: 'Broken page',
      error: 'Error - 500 (Internal server error) received from the web site',
    }),
  ];
}

const json = (status, data) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export class FakeChangedetection {
  constructor({ watches = defaultWatches(), apiKey = API_KEY } = {}) {
    this.watches = new Map(watches.map((w) => [w.uuid, w]));
    this.apiKey = apiKey;
    this.tags = { [TAG_SHOPPING]: 'Shopping' };
    this.version = '0.60.9';
    /** null, 'down', 'tls', 'html' or an HTTP status */
    this.failure = null;
    this.calls = [];
    this.rechecked = [];
  }

  get(uuid) {
    return this.watches.get(uuid);
  }

  /** A new snapshot, as a check that found a change writes it. */
  change(uuid, text, at) {
    const w = this.get(uuid);
    const time = at ?? (w.snapshots.at(-1)?.at ?? 1792569014) + 60;
    w.snapshots.push({ at: time, text });
    w.lastChecked = time;
    w.error = false;
  }

  lastChanged(w) {
    // changedetection.io: 0 until a second snapshot exists.
    return w.snapshots.length >= 2 ? w.snapshots.at(-1).at : 0;
  }

  viewed(w) {
    const newest = w.snapshots.at(-1)?.at ?? 0;
    return Boolean(w.lastViewed) && w.lastViewed >= newest;
  }

  listEntry(w) {
    return {
      last_changed: this.lastChanged(w),
      last_checked: w.lastChecked,
      last_error: w.error,
      link: w.url,
      open_link: w.url,
      page_title: w.pageTitle,
      tags: w.tags,
      title: w.title,
      url: w.url,
      viewed: this.viewed(w),
    };
  }

  /** The request seam (src/cd/http.js signature). */
  async request(url, { method = 'GET', headers = {}, body } = {}) {
    const target = new URL(url);
    this.calls.push(`${method} ${target.pathname}${target.search}`);
    if (this.failure === 'down') {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (this.failure === 'tls') {
      throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    }
    if (this.failure === 'html') {
      return { status: 200, headers: {}, body: '<!DOCTYPE html><html></html>' };
    }
    if (typeof this.failure === 'number') {
      return json(this.failure, { message: 'failure' });
    }
    if (this.apiKey && headers['x-api-key'] !== this.apiKey) {
      return json(403, 'Invalid access - API key invalid.');
    }
    const path = target.pathname.replace(/^.*\/api\/v1/, '');
    const query = target.searchParams;

    if (path === '/watch' && method === 'GET') {
      if (query.get('recheck_all')) {
        this.rechecked.push('all');
        return json(200, { status: `OK, queued ${this.watches.size} watches for rechecking` });
      }
      return json(
        200,
        Object.fromEntries([...this.watches.values()].map((w) => [w.uuid, this.listEntry(w)])),
      );
    }
    if (path === '/systeminfo') {
      return json(200, {
        queue_size: 0,
        overdue_watches: [],
        uptime: 21.36,
        watch_count: this.watches.size,
        version: this.version,
      });
    }
    if (path === '/tags') {
      return json(
        200,
        Object.fromEntries(
          Object.entries(this.tags).map(([uuid, title]) => [
            uuid,
            { date_created: 1792568904, notification_muted: false, title, uuid },
          ]),
        ),
      );
    }
    const match = path.match(/^\/watch\/([0-9a-f-]{36})(?:\/history(?:\/([^/]+))?)?$/);
    const w = match && this.get(match[1]);
    if (!w) {
      return json(404, { message: 'No watch exists with the UUID' });
    }
    if (path.endsWith('/history')) {
      return json(
        200,
        Object.fromEntries(
          w.snapshots.map((s) => [String(s.at), `/datastore/${w.uuid}/${s.at}.txt`]),
        ),
      );
    }
    if (match[2]) {
      if (w.snapshots.length === 0) {
        return json(404, { message: 'Watch found but no history exists' });
      }
      const snapshot =
        match[2] === 'latest'
          ? w.snapshots.at(-1)
          : w.snapshots.find((s) => String(s.at) === match[2]);
      return snapshot
        ? { status: 200, headers: { 'content-type': 'text/plain' }, body: snapshot.text }
        : json(404, { message: 'Timestamp not found' });
    }
    if (method === 'PUT') {
      const data = JSON.parse(body);
      w.lastViewed = data.last_viewed;
      return json(200, 'OK');
    }
    if (query.get('recheck')) {
      this.rechecked.push(w.uuid);
      return json(200, 'OK');
    }
    return json(200, {
      ...this.listEntry(w),
      processor: w.processor,
      paused: false,
      history_n: w.snapshots.length,
      last_viewed: w.lastViewed,
      uuid: w.uuid,
    });
  }
}
