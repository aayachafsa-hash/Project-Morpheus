import { h, cx } from '../dom.js';
import { icon } from '../icons.js';

/** Translucent dark glass with a 1px bronze hairline. `selected` brightens the border to gold. */
export function glassPanel({ as = 'div', className, selected = false, label, role, children = [] } = {}) {
  return h(as, { class: cx('mp-panel', className), 'data-selected': selected ? 'true' : null, 'aria-label': label, role }, children);
}

/** "› PLAY": a small gold chevron before a screen title. */
export function screenTitle({ text, level = 1, id } = {}) {
  const chevron = icon('chevron');
  chevron.classList.add('mp-screen-title__chev');
  return h(`h${level}`, { class: 'mp-screen-title mp-text-title', id }, chevron, text);
}
