# changedetection.io

[changedetection.io](https://changedetection.io/) is a free, self-hosted
service that watches web pages and tells you when they change: a price drop, a
product back in stock, a new post on a forum, a new version of a piece of
software. This integration brings its watches into Gladys: each one becomes a
device (unviewed change, error, last change, what changed, and price and stock
for the shop pages), scenes can react when **any** page changes, a price drops
or a product is back in stock, and a dashboard widget lists the latest
changes.

Tested against a real changedetection.io 0.60.9 (Docker); not yet on every
setup: feedback welcome on
[the issues](https://github.com/guim31/gladys-changedetection/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- changedetection.io, reachable from the Gladys machine (on the local network,
  or on the Internet in HTTPS), with its API enabled (the default).
- Its API key.

changedetection.io does the watching, at the interval set for each watch
(every 3 hours by default): Gladys reads its results, it never fetches the
pages itself. Watches are created and edited in changedetection.io.

## Getting started

### 1. Copy the API key

In changedetection.io, open **Settings → API**. Check that **API access** is
enabled and copy the **API key**.

### 2. Configure the integration

In Gladys, open the integration, then its **Configuration** tab:

- **changedetection.io address**: the address you open changedetection.io
  with, port included, for example `http://192.168.1.2:5000`. An address
  copied from the browser works too.
- **API key**: the key copied above.
- **Refresh interval**: how often Gladys reads the results (1 minute by
  default). One request per read, plus a few after a change.
- **Currency of the prices**: the unit of the price of the "Re-stock & Price
  detection" watches (euro by default). changedetection.io gives the price
  without its currency.
- **Accept self-signed certificates**: only for an `https://` address whose
  certificate your browser does not trust either.
- **Language of the names**: the language of the feature names, of the dates
  and of the error messages (French by default).

Save, then click **Test the connection**: it shows the version of
changedetection.io, the number of watches, those in error and the unviewed
changes.

### 3. Add the watches

The **Discover** tab lists a **changedetection.io** device and one device per
watch. Add the ones you want to see in Gladys. The scene triggers work for
every watch, added or not.

## The devices

Each watch has:

- **Unviewed change**: on while a change has not been viewed (in
  changedetection.io, or with the "Mark as viewed" action).
- **In error**: on while the last check of the page failed.
- **Error message**: the reason of the last failure, "None" otherwise.
- **Last change**: the date and time of the last change.
- **What changed**: a short excerpt of the last change seen by the
  integration, the lines added (or the lines removed, marked "−").
- On a watch of type "Re-stock & Price detection" only: **Price** and
  **In stock**.

The **changedetection.io** device counts the **Watches**, the
**Watches in error** and the **Unviewed changes**.

## Dashboard

The **Latest changes** widget shows the number of unviewed changes and of
watches in error, then the eight latest changes, newest first: title, what
changed, date, and a "New" or "Error" badge. A tap on a change opens its
detail with a link to the page. Two buttons:

- **Check now**: changedetection.io checks every page again now.
- **Mark as viewed**: every change no longer counts as new (asks for
  confirmation).

In its settings, **Watches** narrows it to the devices you choose (only
devices added to Gladys can be chosen).

## Scenes

### Triggers

They fire for every watch, added to Gladys or not. Leave **Watches** empty to
react to any of them, or choose some.

- **A page changed**: changedetection.io detected a change. Variables: watch
  title, page address, what changed (one line, 200 characters at most), tags.
- **A price dropped**: the price of a "Re-stock & Price detection" watch went
  down. Variables: title, address, price, previous price, tags.
- **Back in stock**: a "Re-stock & Price detection" watch went from out of
  stock to in stock. Variables: title, address, price, tags.
- **A watch fails**: the check of a page started failing (page gone, server
  error, filter not found…). Once, until it works again. Variables: title,
  address, error message, tags.

A change that happens while Gladys or the integration restarts is still
announced, once. Nothing is announced at the very first read.

To react under a price threshold, use the **Price** feature of the device in a
Gladys scene ("the price goes below 100"): the scene triggers of
integrations only compare for equality.

### Actions

- **Check a page now**: changedetection.io checks the chosen page again now
  (every page when the field is empty, or the changedetection.io device is
  chosen). The result is read 20 seconds later and fires the triggers above.
  Output: the number of pages queued.
- **Mark as viewed**: the change of the chosen watch no longer counts as new
  (every unviewed change when empty). Output: the number of watches marked.

### Scene ideas

- **Price alert**: trigger "A price dropped" on the coffee grinder → send a
  message "💶 … now at … (was …)" with "Watch title", "Price" and "Previous
  price".
- **Back in stock**: trigger "Back in stock" → send a message with the title
  and the address, then turn a light green.
- **Town hall news**: trigger "A page changed" on the page of the town hall →
  send "📰 …: …" with "Watch title" and "What changed", then "Mark as viewed".
- **Before leaving**: every Saturday at 9:00 → "Check a page now" on the
  opening hours of the market.

## Troubleshooting

- **"API key refused"**: copy the key again from Settings → API; a key
  regenerated in changedetection.io invalidates the old one.
- **"An API key is needed"**: changedetection.io asks for a key and none is
  configured.
- **"changedetection.io does not answer"**: check the address and the port
  (5000 by default) from the Gladys machine. `localhost` is the integration
  container itself: use the IP address of the machine running
  changedetection.io.
- **"Certificate refused"**: the HTTPS certificate is self-signed or expired;
  tick "Accept self-signed certificates", or use the `http://` address on the
  local network.
- **"No changedetection.io API at this address"**: the address points at
  another service, or a changedetection.io too old to have its REST API:
  update it.
- **No price on a shop page**: the watch must use the "Re-stock & Price
  detection" type in changedetection.io, and the page must publish its price
  (most shops do). The price and stock devices appear once the type is set;
  click "Search" in the Discover tab, then "Update" on the device.
- **"What changed" is empty**: it is filled at the first change seen by the
  integration.

## Limits

- changedetection.io checks the pages at its own interval; Gladys reads the
  results at the refresh interval, so an event comes at most that much later.
- The excerpt shows lines added or removed, not changes inside a line, and is
  cut at 200 characters.
- The price has no currency in changedetection.io: the unit comes from the
  configuration, the same for every watch.
- Paused watches stay listed (the API does not say which ones are paused).
- Watches are created, edited and deleted in changedetection.io; Gladys only
  checks them now and marks them as viewed.
