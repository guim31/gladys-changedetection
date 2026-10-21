# changedetection.io for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
brings the watches of [changedetection.io](https://changedetection.io/), the
self-hosted web page change detection service, into Gladys: one device per
watched page, scenes that react when a page changes, a price drops or a
product is back in stock, and a dashboard widget of the latest changes. It
reads the REST API of changedetection.io with its API key, over the local
network. No cloud, no account.

> Tested against a real changedetection.io 0.60.9 (Docker), not yet in a real
> Gladys: feedback welcome in the
> [issues](https://github.com/guim31/gladys-changedetection/issues).

## Features

- **One device per watch**, proposed in the Discover tab (the user adds the
  ones to follow): **Unviewed change**, **In error** and its **Error
  message**, **Last change** (date and time), **What changed** (a short
  excerpt), and on "Re-stock & Price detection" watches **Price** and **In
  stock**. A **changedetection.io** device counts the watches, those in error
  and the unviewed changes. Feature names in French by default (English,
  German and Spanish available).
- **Scene triggers**, for every watch, added to Gladys or not: _A page
  changed_ (title, address, excerpt, tags), _A price dropped_ (price and
  previous price), _Back in stock_, _A watch fails_ (error message).
- **Scene actions**: _Check a page now_ (one page or all of them; the result
  fires the triggers) and _Mark as viewed_.
- **Dashboard widget** "Latest changes": unviewed changes and errors, the
  eight latest changes with their excerpt, date, badge and a link to the page,
  **Check now** and **Mark as viewed** buttons.
- A **Test the connection** button, a connection status naming the problem, a
  **transport badge** per device. Every text in English, French, German and
  Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- **changedetection.io** with its REST API (Settings → API), reachable from
  the Gladys machine, and its API key.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-changedetection`
   (or install **changedetection.io** from the catalog once it is listed).
2. In **Configuration**, enter the address of changedetection.io
   (`http://192.168.1.2:5000`…) and its API key. Save, then click **Test the
   connection**.
3. Open the **Discover** tab and add the watches to follow.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (30 s to 15 min, 1 min by default), the integration
  reads `GET /api/v1/watch` (one request: last change, last check, last error,
  viewed, titles, URL and tags of every watch). changedetection.io does the
  checking of the pages; the integration never fetches them.
- Once per watch it reads `GET /api/v1/watch/<uuid>` for its processor: a
  "Re-stock & Price detection" watch (`restock_diff`) gets the price and stock
  features. changedetection.io 0.60.9 does not expose the price in its API: it
  is read from the snapshot of the watch, the line `In Stock: True - Price:
99.9` written by changedetection.io.
- After a change (`last_changed` moved), it reads the history and the two last
  snapshots (`/history`, `/history/<timestamp>`) for the excerpt (the lines
  added, or removed) and the new price and stock.
- What was last seen of each watch is kept in
  `/data/changedetection-state.json`: a change that happens while Gladys or the
  integration restarts is still announced, once. The first read only records.
- _Check now_ calls `?recheck=1` (or `?recheck_all=1`) and reads the result 20
  seconds later; _Mark as viewed_ sets `last_viewed` with
  `PUT /api/v1/watch/<uuid>`, what the web interface does when the difference
  is opened.
- Only the values that changed are sent to Gladys, only for the devices added,
  all of them again when a device is added or Gladys reconnects, and every 12
  hours. The devices are published with `should_poll: false`: the interval
  goes beyond the list of the Gladys scheduler, and the scene events fire for
  watches whose device was not added.
- HTTP(S) runs on `node:http` / `node:https`, so a self-signed certificate can
  be accepted when the user ticks the option.

## Checked on a real changedetection.io, and what was not

See the section of the same name in [`CLAUDE.md`](CLAUDE.md). In short, on
21/10/2026 the client and the integration ran against a real
`ghcr.io/dgtlmoon/changedetection.io` (0.60.9) container watching test pages
served on a private Docker network (a text page, a shop page with JSON-LD
price and stock, a page answering 500). Not checked: a real Gladys (the
widget, the scene editor), a reverse proxy in front of changedetection.io,
watches using the Playwright browser.

## Limitations

- changedetection.io checks the pages at its own interval; Gladys reads the
  results at the refresh interval.
- The excerpt shows lines added or removed, cut at 200 characters.
- The price has no currency in changedetection.io: the unit comes from the
  configuration.
- Paused watches stay listed (the list API does not tell them apart).
- Watches are created and edited in changedetection.io.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory changedetection.io (`test/helpers/fakeChangedetection.js`)
checked against real answers of changedetection.io 0.60.9
(`test/fixtures/changedetection/`). See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

## Credits

- [changedetection.io](https://github.com/dgtlmoon/changedetection.io) by
  Leigh Morresi (dgtlmoon) and contributors (Apache-2.0): the REST API read
  here (`changedetectionio/api/`), the restock snapshot format
  (`processors/restock_diff/`). The logo on the cover comes from its
  repository (`changedetectionio/static/images/`).
- The architecture and the conformity tests follow
  [gladys-uptime-kuma](https://github.com/guim31/gladys-uptime-kuma) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by
changedetection.io or its authors.

## License

Apache-2.0
