// Settings controls the Step 1 kit does not have: slider, on/off switch, radio-style choice.
// Same conventions as the kit: plain DOM, `.mp-` classes, small methods on the returned element (setValue).
// They only render and report; the settings screen decides what a change means.

import { h, uid } from '../dom.js';

const hintNode = (id, hint) => hint ? h('p', { class: 'mp-text-body mp-gs-control__hint', id }, hint) : null;

/** Slider with a live value readout. onInput(number) fires while dragging. */
export function rangeControl({ id = uid('mp-gs-range'), label, min, max, step = 1, value, format = v => String(v), hint, onInput } = {}) {
  const hintId = `${id}-hint`;
  const readout = h('output', { class: 'mp-gs-control__value', for: id, 'aria-live': 'off' });
  const input = h('input', { type: 'range', id, class: 'mp-gs-range', min, max, step, 'aria-describedby': hint ? hintId : null });
  const sync = next => { input.value = String(next); readout.textContent = format(Number(input.value)); input.setAttribute('aria-valuetext', readout.textContent); };
  input.addEventListener('input', () => { sync(Number(input.value)); onInput?.(Number(input.value)); });
  const el = h('div', { class: 'mp-gs-control', 'data-type': 'range' },
    h('div', { class: 'mp-gs-control__head' }, h('label', { class: 'mp-gs-control__label', for: id }, label), readout), input, hintNode(hintId, hint));
  el.setValue = sync; el.input = input;
  sync(value);
  return el;
}

/** On/off switch (role="switch"). onChange(boolean) after the user toggles it. */
export function toggleControl({ id = uid('mp-gs-switch'), label, value = false, hint, onChange } = {}) {
  const hintId = `${id}-hint`; const labelId = `${id}-label`;
  const stateText = h('span', { class: 'mp-gs-switch__state', 'aria-hidden': 'true' });
  const button = h('button', { type: 'button', role: 'switch', id, class: 'mp-gs-switch', 'aria-labelledby': labelId, 'aria-describedby': hint ? hintId : null },
    h('span', { class: 'mp-gs-switch__track', 'aria-hidden': 'true' }, h('span', { class: 'mp-gs-switch__thumb' })), stateText);
  const sync = next => { button.setAttribute('aria-checked', String(!!next)); stateText.textContent = next ? 'On' : 'Off'; };
  button.addEventListener('click', () => { const next = button.getAttribute('aria-checked') !== 'true'; sync(next); onChange?.(next); });
  const el = h('div', { class: 'mp-gs-control mp-gs-control--switch', 'data-type': 'toggle' },
    h('div', { class: 'mp-gs-control__head' }, h('label', { class: 'mp-gs-control__label', id: labelId, for: id }, label), button), hintNode(hintId, hint));
  el.setValue = sync; el.input = button;
  sync(value);
  return el;
}

/** Radio group of short options. Arrow keys / Home / End move AND select; one tab stop (roving tabindex). onChange(value). */
export function choiceControl({ id = uid('mp-gs-choice'), label, options = [], value, hint, onChange } = {}) {
  const hintId = `${id}-hint`; const labelId = `${id}-label`;
  const group = h('div', { class: 'mp-gs-choice', role: 'radiogroup', id, 'aria-labelledby': labelId, 'aria-describedby': hint ? hintId : null });
  const buttons = options.map(option => {
    const button = h('button', { type: 'button', role: 'radio', class: 'mp-gs-choice__option', 'data-value': String(option.value), 'aria-checked': 'false', tabindex: '-1' }, option.label);
    button.addEventListener('click', () => { sync(option.value); onChange?.(option.value); });
    return button;
  });
  group.append(...buttons);
  const sync = next => {
    const index = Math.max(0, options.findIndex(option => option.value === next));
    buttons.forEach((button, i) => { button.setAttribute('aria-checked', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
  };
  group.addEventListener('keydown', event => {
    const i = buttons.indexOf(event.target); if (i < 0) return;
    const last = buttons.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
    if (next == null) return;
    event.preventDefault(); buttons[next].focus(); buttons[next].click();
  });
  const el = h('div', { class: 'mp-gs-control', 'data-type': 'choice' }, h('span', { class: 'mp-gs-control__label', id: labelId }, label), group, hintNode(hintId, hint));
  el.setValue = sync; el.input = group;
  sync(value);
  return el;
}
