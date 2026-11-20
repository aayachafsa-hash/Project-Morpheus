// Arrow-key focus movement for menus (one column) and grids. Pure helpers: they only move focus and report whether they handled the key.
// Meant to be called from a screen's onKey(event); the manager treats a `true` return as handled.

/** Number of items in the first visual row (the grid's column count). Needs real layout; falls back to "one row" without it. */
export function countColumns(items) {
  if (!items.length) return 1;
  const top = items[0].getBoundingClientRect().top;
  let count = 0;
  for (const item of items) { if (Math.abs(item.getBoundingClientRect().top - top) > 2) break; count += 1; }
  return Math.max(1, count);
}

/**
 * moveFocus(event, items, { columns = 1, wrap = true })
 *  columns = 1 : ↑ ↓ move, Home / End jump, ← → are left alone (a menu).
 *  columns > 1 : ← → move by one, ↑ ↓ by a row, Home / End jump; the grid does not wrap.
 */
export function moveFocus(event, items, { columns = 1, wrap = true } = {}) {
  const from = items.findIndex(item => item === event.target || item.contains?.(event.target));
  if (from < 0 || !items.length) return false;
  const last = items.length - 1;
  let to = null;
  switch (event.key) {
    case 'Home': to = 0; break;
    case 'End': to = last; break;
    case 'ArrowDown': to = from + columns; if (to > last) to = wrap && columns === 1 ? 0 : from; break;
    case 'ArrowUp': to = from - columns; if (to < 0) to = wrap && columns === 1 ? last : from; break;
    case 'ArrowRight': if (columns > 1) to = Math.min(last, from + 1); break;
    case 'ArrowLeft': if (columns > 1) to = Math.max(0, from - 1); break;
    default: break;
  }
  if (to == null) return false;
  event.preventDefault();
  items[to].focus({ preventScroll: false });
  return true;
}
