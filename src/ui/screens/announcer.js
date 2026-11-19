import { h } from '../dom.js';

/** Visually hidden polite live region. A trailing nbsp alternates so repeating the same message is still announced. */
export function createAnnouncer() {
  const el = h('div', { class: 'mp-stage__announcer', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let flip = false;
  return {
    el,
    say(message) { flip = !flip; el.textContent = ''; el.textContent = String(message) + (flip ? '' : '\u00a0'); },
    destroy() { el.remove(); },
  };
}
