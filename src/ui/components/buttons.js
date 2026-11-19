import { h, cx } from '../dom.js';
import { icon } from '../icons.js';

/** Gold / teal / quiet button. Disabled uses aria-disabled so it stays focusable and announces why it is inert. */
export function goldButton({ label, onClick, tone = 'gold', chevron = true, disabled = false, selected = false, id, ariaLabel } = {}) {
  const el = h('button', {
    type: 'button', id, class: cx('mp-btn', tone !== 'gold' && `mp-btn--${tone}`),
    'aria-label': ariaLabel, 'aria-disabled': disabled ? 'true' : null, 'data-selected': selected ? 'true' : null,
  }, h('span', { class: 'mp-btn__label' }, label));
  if (chevron) { const c = icon('chevron'); c.classList.add('mp-btn__chev'); el.append(c); }
  el.addEventListener('click', event => { if (el.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; } onClick?.(event); });
  el.setDisabled = value => { value ? el.setAttribute('aria-disabled', 'true') : el.removeAttribute('aria-disabled'); };
  return el;
}

/** Left-aligned menu row. Frame + chevron appear when selected, hovered or keyboard-focused. */
export function menuItem({ label, description, selected = false, onClick, id } = {}) {
  const chevron = icon('chevron'); chevron.classList.add('mp-menu-item__chev');
  const text = h('span', {}, label, description && h('span', { class: 'mp-menu-item__sub' }, description));
  const el = h('button', { type: 'button', id, class: 'mp-menu-item', 'data-selected': selected ? 'true' : null }, text, chevron);
  if (onClick) el.addEventListener('click', onClick);
  el.setSelected = value => { value ? el.setAttribute('data-selected', 'true') : el.removeAttribute('data-selected'); };
  return el;
}

/** Corner icon button with a tiny caption (Reset, Pause). Pass `pressed` for toggles. */
export function iconButton({ iconName, label, caption, onClick, pressed, id } = {}) {
  const ring = h('span', { class: 'mp-icon-btn__ring' }, icon(iconName));
  const el = h('button', { type: 'button', id, class: 'mp-icon-btn', 'aria-label': label, 'aria-pressed': pressed == null ? null : String(!!pressed) },
    ring, caption && h('span', { class: 'mp-icon-btn__caption', 'aria-hidden': 'true' }, caption));
  if (onClick) el.addEventListener('click', onClick);
  el.setIcon = name => ring.replaceChildren(icon(name));
  el.setPressed = value => el.setAttribute('aria-pressed', String(!!value));
  return el;
}
