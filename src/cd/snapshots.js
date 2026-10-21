// -----------------------------------------------------------------------------
// What the snapshots of a watch say: the short excerpt of a change (the lines
// added, or the lines removed when nothing was added), and the price and stock
// of a "Re-stock & Price detection" watch, whose snapshot is one line written by
// changedetection.io (processors/restock_diff/processor.py):
//   In Stock: True - Price: 99.9
// `In Stock` is True, False or None (not detected); `Price` a number or None.
// -----------------------------------------------------------------------------

export const MAX_EXCERPT = 200;

const RESTOCK = /^\s*In Stock:\s*(True|False|None)\s*-\s*Price:\s*([^\s]+)\s*$/i;

/**
 * @param {string} snapshot
 * @returns {{ inStock: boolean|null, price: number|null }|null} null: not a restock snapshot
 */
export function parseRestock(snapshot) {
  const match = typeof snapshot === 'string' ? snapshot.trim().match(RESTOCK) : null;
  if (!match) {
    return null;
  }
  const stock = match[1].toLowerCase();
  const price = Number(match[2].replace(',', '.'));
  return {
    inStock: stock === 'true' ? true : stock === 'false' ? false : null,
    price: Number.isFinite(price) && match[2].toLowerCase() !== 'none' ? price : null,
  };
}

const lines = (snapshot) =>
  (typeof snapshot === 'string' ? snapshot : '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** Cut at `max` characters, on a word when possible, with an ellipsis. */
export function shorten(value, max) {
  if (value.length <= max) {
    return value;
  }
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The excerpt of a change: the lines of `latest` absent from `previous`, or
 * the lines removed ("− …") when nothing was added. One line, MAX_EXCERPT
 * characters at most; '' when the texts hold the same lines.
 * @param {string|null} previous the snapshot before (null: the first one)
 * @param {string} latest
 */
export function excerpt(previous, latest, max = MAX_EXCERPT) {
  const before = lines(previous);
  const after = lines(latest);
  const old = new Set(before);
  let picked = after.filter((line) => !old.has(line));
  if (picked.length === 0) {
    const kept = new Set(after);
    picked = before.filter((line) => !kept.has(line)).map((line) => `− ${line}`);
  }
  return shorten(picked.join(' · '), max);
}
