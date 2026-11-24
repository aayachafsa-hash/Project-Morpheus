import { svgFromMarkup } from './dom.js';

// Thin-line (1.2px) gold-friendly icons on a 24×24 grid. They inherit `currentColor`.
// Laurel is generated: a curved stem with paired leaves, drawn once (left); the right one is mirrored in CSS.
function laurel() {
  const leaves = [[13, 46, 38], [9, 40, 20], [7, 33, 8], [6.5, 26, 0], [7, 19, -8], [9, 12, -22], [12, 6, -38]];
  const shapes = leaves.map(([x, y, a]) =>
    `<ellipse cx="${x - 3.2}" cy="${y}" rx="3.4" ry="1.5" transform="rotate(${a - 30} ${x - 3.2} ${y})"/>` +
    `<ellipse cx="${x + 2.6}" cy="${y - 1}" rx="3" ry="1.3" transform="rotate(${a + 30} ${x + 2.6} ${y - 1})"/>`).join('');
  return { viewBox: '0 0 24 24', body: `<g transform="translate(6 0) scale(.428571)" stroke-width="2.8"><path d="M20 53C8 45 3 28 11 4"/>${shapes}</g>` };
}
const L = laurel();

const ICONS = {
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/>',
  group: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.4 3-5.4 6-5.4s5.5 2 6 5.4"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M17 14.3c2.3.5 3.7 2.4 4 5.2"/>',
  infinity: '<path d="M12 12c-1.6-2.4-3.2-4-5.2-4C4.6 8 3 9.8 3 12s1.6 4 3.8 4c2 0 3.6-1.6 5.2-4zm0 0c1.6 2.4 3.2 4 5.2 4 2.2 0 3.8-1.8 3.8-4s-1.6-4-3.8-4c-2 0-3.6 1.6-5.2 4z"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 7h18v3H3zM12 7v13"/><path d="M12 7c-1-3-4.5-3.6-4.5-1.5S10.5 7 12 7zm0 0c1-3 4.5-3.6 4.5-1.5S13.5 7 12 7z"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  gear: '<path d="M10 3h4l.6 2.6 2 .9L19 5.3l2 3.4-1.9 1.9v2.8l1.9 1.9-2 3.4-2.4-1.2-2 .9L14 21h-4l-.6-2.6-2-.9L5 18.7l-2-3.4 1.9-1.9v-2.8L3 8.7l2-3.4 2.4 1.2 2-.9z"/><circle cx="12" cy="12" r="3"/>',
  'mouse-left': '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M6 10h12M12 3v7"/><path fill="currentColor" stroke="none" d="M7 9a5 5 0 0 1 4.5-5v5z"/>',
  'mouse-right': '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M6 10h12M12 3v7"/><path fill="currentColor" stroke="none" d="M17 9a5 5 0 0 0-4.5-5v5z"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  // Neutral silhouettes used as placeholders in trays and level tiles.
  crescent: '<path d="M16 4.5C10 5 6 9 6 14c0 3.4 2.4 5.8 6 5.8 3 0 5.4-1.4 6.6-3.6-4.8.2-8-3-6.6-7.2.6-1.8 1.8-3.4 3.4-4.5z"/>',
  cone: '<path d="M12 3.5l6 15.5H6z"/><path d="M8.4 14h7.2"/>',
  oval: '<ellipse cx="12" cy="12" rx="7.5" ry="5.5" transform="rotate(-25 12 12)"/>',
  fish: '<path d="M3.5 12c3-4.6 8-6 11-2.5L20.5 6v12l-6-3.5c-3 3.5-8 2.1-11-2.5z"/>',
};
ICONS.laurel = L.body;

/** icon('chevron', { size: 16, label: 'Next' }) → <svg class="mp-icon"> (decorative unless a label is given). */
export function iconMarkup(name, { label, filled = false, standalone = false } = {}) {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon "${name}". Available: ${Object.keys(ICONS).join(', ')}`);
  const viewBox = name === 'laurel' ? L.viewBox : '0 0 24 24';
  const labelAttrs = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  const attributes = standalone ? 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"' : '';
  return `<svg class="mp-icon${filled ? ' mp-icon--filled' : ''}${name === 'laurel' ? ' mp-laurel' : ''}" viewBox="${viewBox}" ${attributes} ${labelAttrs}>${body}</svg>`;
}
export function icon(name, { size, label, filled = false } = {}) {
  const el = svgFromMarkup(iconMarkup(name,{label,filled}));
  if (size) { el.style.width = el.style.height = typeof size === 'number' ? `${size}px` : size; }
  return el;
}
export const iconNames = Object.keys(ICONS);
