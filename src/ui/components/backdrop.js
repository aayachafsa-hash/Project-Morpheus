import { h, svgFromMarkup, prefersReducedMotion } from '../dom.js';

const MAX_DUST = 24; // hard cap: dust is decoration, keep it cheap.

// Small deterministic PRNG so the dust layout is the same on every load.
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const SHAFTS = `<svg class="mp-backdrop__shafts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="mp-shaft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c98a" stop-opacity=".30"/><stop offset=".6" stop-color="#d9a96a" stop-opacity=".07"/><stop offset="1" stop-color="#d9a96a" stop-opacity="0"/></linearGradient>
  <filter id="mp-soft"><feGaussianBlur stdDeviation=".6"/></filter></defs>
  <g fill="url(#mp-shaft)" filter="url(#mp-soft)"><polygon points="8,-2 22,-2 62,100 36,100"/><polygon points="26,-2 34,-2 84,100 70,100"/><polygon points="-4,18 4,10 40,100 18,100"/></g></svg>`;

/**
 * Atmosphere for a whole screen: base gradient, warm glow, light shafts, grain, dust, vignette.
 * variant: warm | dim | fail | win.  parallax shifts layers 4–12px with the pointer (off under reduced motion).
 * Call el.destroy() when the screen unmounts.
 */
export function backdrop({ variant = 'warm', shafts = true, dust = true, dustCount = 16, parallax = true } = {}) {
  const el = h('div', { class: 'mp-backdrop', 'data-variant': variant, 'aria-hidden': 'true' },
    h('div', { class: 'mp-backdrop__base' }), h('div', { class: 'mp-backdrop__glow' }));
  if (shafts) el.append(svgFromMarkup(SHAFTS));
  el.append(h('div', { class: 'mp-backdrop__grain' }));
  if (dust) {
    const rand = rng(7); const layer = h('div', { class: 'mp-backdrop__dust' });
    for (let i = 0; i < Math.min(dustCount, MAX_DUST); i++) {
      layer.append(h('span', { class: 'mp-dust', style: { '--x': `${(rand() * 100).toFixed(1)}%`, '--y': `${(30 + rand() * 65).toFixed(1)}%`, '--s': `${(1 + rand() * 2).toFixed(1)}px`, '--d': `${(9 + rand() * 9).toFixed(1)}s`, '--delay': `-${(rand() * 14).toFixed(1)}s` } }));
    }
    el.append(layer);
  }
  el.append(h('div', { class: 'mp-backdrop__vignette' }));

  let frame = 0, listening = false;
  const onMove = event => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      el.style.setProperty('--px', ((event.clientX / innerWidth - 0.5) * 2).toFixed(3));
      el.style.setProperty('--py', ((event.clientY / innerHeight - 0.5) * 2).toFixed(3));
    });
  };
  if (parallax && !prefersReducedMotion() && typeof requestAnimationFrame === 'function') { addEventListener('pointermove', onMove, { passive: true }); listening = true; }
  el.destroy = () => { if (listening) removeEventListener('pointermove', onMove); if (frame) cancelAnimationFrame(frame); listening = false; el.remove(); };
  return el;
}
