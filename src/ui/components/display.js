import { h, cx, uid, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { glassPanel } from './panel.js';

/** <kbd> key cap: keyCap('Q / E'), keyCap('Tab'). */
export const keyCap = text => h('kbd', { class: 'mp-key' }, text);

/** "[R] to rotate": one entry of a HUD hint strip. */
export const keyHint = ({ keys, text }) => h('span', { class: 'mp-key-hint' }, [].concat(keys).map(keyCap), text);

/** MATCH / 82%. update(value) accepts a number (0–100) or null for "—". */
export function statBadge({ label = 'MATCH', value = null, tone = 'neutral' } = {}) {
  const output = h('output', { class: 'mp-stat__value' });
  const el = h('div', { class: 'mp-stat', 'data-tone': tone }, h('span', { class: 'mp-stat__label' }, label), output);
  el.update = next => { output.textContent = Number.isFinite(next) ? `${Math.round(next)}%` : '—'; };
  el.update(value);
  return el;
}

/** Solo target card (title + media + MATCH) or P1/P2 accuracy card (player icon + MATCH). Display only: it never computes a score. */
export function hudCard({ player, title, media, label = 'MATCH', value = null } = {}) {
  const isPlayer = player === 'p1' || player === 'p2';
  const tag = isPlayer ? player.toUpperCase() : title;
  const head = h('div', { class: 'mp-hud-card__head' }, isPlayer && icon('person'), h('span', {}, tag));
  const stat = statBadge({ label, value, tone: isPlayer ? player : 'teal' });
  const el = glassPanel({
    className: 'mp-hud-card', role: 'group', label: isPlayer ? `Player ${player.slice(1)} ${label.toLowerCase()}` : `${title} ${label.toLowerCase()}`,
    children: [head, media && h('div', { class: 'mp-hud-card__media' }, media), h('div', { class: 'mp-hud-card__body' }, stat)],
  });
  if (isPlayer) { el.dataset.player = player; el.dataset.align = player === 'p2' ? 'end' : 'start'; }
  el.update = stat.update;
  return el;
}

/** Gold progress bar with shimmer; the % readout eases toward the value (instant under reduced motion). */
export function progressBar({ value = 0, label, id } = {}) {
  const name = id || uid('mp-progress');
  const fill = h('div', { class: 'mp-progress__fill' });
  const readout = h('span', { class: 'mp-progress__value', 'aria-hidden': 'true' }, '0%');
  const track = h('div', { class: 'mp-progress__track', role: 'progressbar', id: name, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': label || 'Loading' }, fill);
  const el = h('div', { class: 'mp-progress' }, label && h('span', { class: 'mp-progress__label', 'aria-hidden': 'true' }, label), track, readout);
  let shown = 0, frame = 0;
  const paint = v => { fill.style.setProperty('--mp-progress', String(v)); readout.textContent = `${Math.round(v)}%`; };
  el.update = next => {
    const target = Math.min(100, Math.max(0, Number(next) || 0));
    track.setAttribute('aria-valuenow', String(Math.round(target)));
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') { shown = target; paint(shown); return; }
    const step = () => { shown += (target - shown) * 0.18; if (Math.abs(target - shown) < 0.2) shown = target; paint(shown); if (shown !== target) frame = requestAnimationFrame(step); };
    step();
  };
  el.update(value);
  return el;
}

/** ★★☆ — role=img with a readable label. */
export function starRating({ value = 0, max = 3, size } = {}) {
  const el = h('span', { class: 'mp-stars', role: 'img' });
  if (size) el.style.setProperty('--mp-star-size', typeof size === 'number' ? `${size}px` : size);
  el.update = next => {
    const filled = Math.max(0, Math.min(max, Math.round(next)));
    el.setAttribute('aria-label', `${filled} of ${max} stars`);
    el.replaceChildren(...Array.from({ length: max }, (_, i) => { const s = icon('star', { filled: i < filled }); s.dataset.filled = String(i < filled); return s; }));
  };
  el.update(value);
  return el;
}

/** Centered display title flanked by laurels (VICTORY, PUZZLE COMPLETED). tone: gold | fail | neutral. */
export function laurelTitle({ text, tone = 'gold', level = 1, laurels = tone !== 'fail', id } = {}) {
  const left = icon('laurel'); const right = icon('laurel'); right.classList.add('mp-laurel--r');
  return h('div', { class: 'mp-laurel-title', 'data-tone': tone },
    laurels && left, h(`h${level}`, { class: cx('mp-text-display', 'mp-laurel-title__text'), id }, text), laurels && right);
}
