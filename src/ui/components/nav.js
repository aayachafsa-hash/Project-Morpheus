import { h, uid } from '../dom.js';
import { icon } from '../icons.js';
import { starRating } from './display.js';

/** Tabs with roving tabindex, ←/→/Home/End, and aria wiring. Panels use ids from el.tabId(id) / el.panelId(id). */
export function tabBar({ tabs, active, onChange, label = 'Sections' } = {}) {
  const base = uid('mp-tabs');
  const el = h('div', { class: 'mp-tabs', role: 'tablist', 'aria-label': label });
  const buttons = new Map();
  const select = (id, { focus = false, silent = false } = {}) => {
    for (const [tabId, button] of buttons) {
      const on = tabId === id;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      if (on && focus) button.focus();
    }
    if (!silent) onChange?.(id);
  };
  tabs.forEach(({ id, text }) => {
    const button = h('button', { type: 'button', role: 'tab', class: 'mp-tab', id: `${base}-tab-${id}`, 'aria-controls': `${base}-panel-${id}` }, text);
    button.addEventListener('click', () => select(id));
    buttons.set(id, button); el.append(button);
  });
  el.addEventListener('keydown', event => {
    const ids = [...buttons.keys()]; const i = ids.findIndex(id => buttons.get(id) === event.target);
    if (i < 0) return;
    const next = { ArrowRight: (i + 1) % ids.length, ArrowLeft: (i - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1 }[event.key];
    if (next == null) return;
    event.preventDefault(); select(ids[next], { focus: true });
  });
  el.tabId = id => `${base}-tab-${id}`; el.panelId = id => `${base}-panel-${id}`;
  el.setActive = id => select(id, { silent: true });
  select(active ?? tabs[0].id, { silent: true });
  return el;
}

/** Level grid tile. state: complete | current | available | locked. Locked tiles stay focusable but inert. */
export function levelTile({ number, state = 'available', stars = 0, maxStars = 3, showStars = state !== 'available', thumb, name, onClick } = {}) {
  const pad = String(number).padStart(2, '0');
  const locked = state === 'locked';
  const media = locked ? icon('lock') : (thumb || icon('fish'));
  const el = h('button', {
    type: 'button', class: 'mp-level-tile', 'data-state': state, 'aria-disabled': locked ? 'true' : null,
    'aria-label': `Level ${pad}${name ? `, ${name}` : ''}${locked ? ', locked' : state === 'complete' ? `, ${stars} of ${maxStars} stars` : ''}`,
  }, h('span', { class: 'mp-level-tile__thumb' }, media), h('span', { class: 'mp-level-tile__num' }, pad), !locked && showStars ? starRating({ value: stars, max: maxStars, size: 10 }) : null);
  el.addEventListener('click', event => { if (locked) { event.preventDefault(); return; } onClick?.(number, event); });
  return el;
}

/** Objects tray. tone: teal (solo) | p1 | p2. items: [{ id, label, iconName? , thumb? }]. Display + selection only. */
export function objectTray({ items = [], selected = 0, onSelect, title = 'OBJECTS', tone = 'teal', label } = {}) {
  const slots = h('div', { class: 'mp-tray__slots' });
  const el = h('nav', { class: 'mp-panel mp-tray', 'data-tone': tone, 'aria-label': label || `${title.toLowerCase()} tray` },
    h('span', { class: 'mp-tray__title', 'aria-hidden': 'true' }, title), slots);
  let current = selected;
  const render = () => {
    slots.replaceChildren(...items.map((item, index) => {
      const button = h('button', { type: 'button', class: 'mp-slot', 'aria-pressed': String(index === current), 'aria-label': `Select ${item.label}`, 'data-object': String(index) },
        item.thumb || (item.showIcon !== false && icon(item.iconName || 'crescent')), h('span', { class: 'mp-slot__num' }, String(index + 1).padStart(2, '0')));
      button.addEventListener('click', () => { el.select(index); onSelect?.(index, item); });
      return button;
    }));
  };
  el.select = index => { current = index; slots.querySelectorAll('.mp-slot').forEach((b, i) => b.setAttribute('aria-pressed', String(i === index))); };
  el.setItems = next => { items = next; render(); };
  render();
  return el;
}
