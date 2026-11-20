// MORPHEUS UI, Step 4.1: the solo gameplay HUD (visual layer only).
//
//   import { gameplayHud } from './src/ui/gameplay-hud/index.js';
//   const hud = gameplayHud({ levelNumber: 3, levelName: 'Aquafish', onPause, onReset, onCheckShadow, onShowSolution });
//   container.append(hud);          // the HUD fills its container (position: absolute; inset: 0)
//   hud.setMatch(82, { state: 'close' });
//
// Display only. It renders what it is given and calls the callbacks it is given. It never reads the scene or the
// gameplay state, never computes a match, a score or a threshold, never listens to the keyboard (the gameplay owns
// R / Shift / Z / wheel; the hints below are text) and never calls the screen manager. Wiring is Step 4.2.
//
// Link tokens.css, ui.css and gameplay-hud.css (in that order). Every class is .mp-ghud- prefixed.

import { h, cx } from '../dom.js';
import { icon } from '../icons.js';
import { goldButton, iconButton, screenTitle, hudCard, keyHint } from '../components/index.js';

/** The five control hints, in display order. `keys` are keyboard keys (<kbd>); `mouse` entries are not keys. */
export const CONTROL_HINTS = Object.freeze([
  { id: 'drag', mouse: 'Drag', text: 'Move', title: 'Drag with the mouse to move the object' },
  { id: 'rotate', keys: 'R', text: 'Rotate', title: 'R: rotate the object' },
  { id: 'tilt', keys: 'Shift', text: 'Tilt', title: 'Shift: tilt the object' },
  { id: 'height', keys: 'Z', text: 'Height', title: 'Z: change the object height' },
  { id: 'depth', mouse: 'Wheel', text: 'Depth', title: 'Mouse wheel: change the object depth' },
]);

/** Presentation states of the match feedback area. The caller picks one; the HUD never derives it from a value. */
export const MATCH_STATES = Object.freeze(['idle', 'checking', 'close', 'match', 'miss']);

export const DEFAULT_MESSAGES = Object.freeze({
  idle: 'Shape the shadow to match the target',
  checking: 'Checking shadow…',
  close: 'Getting close',
  match: 'Shadow matched',
  miss: 'Not quite there yet',
});

const BUTTONS = ['pause', 'reset', 'check', 'solution'];
const clampPercent = value => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null);
const formatLevel = number => (Number.isFinite(number) ? String(Math.max(0, Math.trunc(number))).padStart(2, '0') : '—');

/**
 * gameplayHud(options) -> HTMLElement with methods
 *
 * options
 *   levelNumber, levelName       shown top-left ("LEVEL 03" + name); both optional
 *   match                        number 0–100 | null (null shows "—")
 *   matchState                   one of MATCH_STATES (default 'idle')
 *   messages                     overrides for DEFAULT_MESSAGES, per state
 *   hintsVisible                 default true (bind it to the existing `controlHints` setting)
 *   headingLevel                 heading level of the level title (default 1: the gameplay screen has no other heading)
 *   onPause, onReset, onCheckShadow, onShowSolution   click callbacks (optional)
 *
 * methods
 *   setLevel({ number, name })   setMatch(value, { state?, message? })   setDisabled(name, disabled = true)
 *   setHintsVisible(visible)     setActiveControl(id | null)             destroy()
 *   name is one of 'pause' | 'reset' | 'check' | 'solution'; el.buttons holds the four elements.
 *   Disabled buttons use aria-disabled (they stay focusable) and ignore clicks, like the kit's goldButton.
 */
export function gameplayHud({
  levelNumber = null, levelName = '', match = null, matchState = 'idle', messages = {}, hintsVisible = true, headingLevel = 1,
  onPause, onReset, onCheckShadow, onShowSolution,
} = {}) {
  const text = { ...DEFAULT_MESSAGES, ...messages };

  // ── Level (top-left) ──
  const title = screenTitle({ text: `Level ${formatLevel(levelNumber)}`, level: headingLevel });
  const nameEl = h('p', { class: 'mp-text-caption mp-ghud__level-name' }, levelName);
  nameEl.hidden = !levelName;
  const level = h('div', { class: 'mp-ghud__level' }, title, nameEl);

  // ── Shadow match feedback (top-centre): the kit's hudCard + a meter + one status line ──
  const card = hudCard({ title: 'Shadow', label: 'Match', value: null });
  card.classList.add('mp-ghud__match');
  const stat = card.querySelector('.mp-stat');
  stat.querySelector('output').setAttribute('aria-live', 'off'); // <output> is a live region: do not announce every drag frame
  const meterFill = h('span', { class: 'mp-ghud__meter-fill' });
  const meter = h('div', { class: 'mp-ghud__meter', role: 'meter', 'aria-label': 'Shadow match', 'aria-valuemin': '0', 'aria-valuemax': '100' }, meterFill);
  const statusIcon = h('span', { class: 'mp-ghud__status-icon', 'aria-hidden': 'true' }, icon('check'));
  const statusText = h('span', { class: 'mp-ghud__status-text' });
  const status = h('p', { class: 'mp-ghud__status', role: 'status' }, statusIcon, statusText);
  card.querySelector('.mp-hud-card__body').append(meter, status);

  let state = 'idle';
  const setStatus = (nextState, message) => {
    state = MATCH_STATES.includes(nextState) ? nextState : 'idle';
    card.dataset.state = state;
    statusIcon.hidden = state !== 'match';
    const next = typeof message === 'string' && message ? message : text[state];
    if (statusText.textContent !== next) statusText.textContent = next; // unchanged text is not re-announced
  };
  const paintMatch = value => {
    const v = clampPercent(value);
    card.update(v);
    meter.setAttribute('aria-valuenow', String(v == null ? 0 : Math.round(v)));
    meter.setAttribute('aria-valuetext', v == null ? 'Not measured yet' : `${Math.round(v)} percent`);
    meterFill.style.setProperty('--mp-ghud-match', String(v == null ? 0 : v));
  };
  paintMatch(match);
  setStatus(matchState);

  // ── Buttons ──
  const pause = iconButton({ iconName: 'pause', label: 'Pause game', caption: 'Pause' });
  const reset = iconButton({ iconName: 'reset', label: 'Reset puzzle', caption: 'Reset' });
  const check = goldButton({ label: 'Check Shadow', tone: 'teal', chevron: false });
  const solution = goldButton({ label: 'Show Solution', tone: 'quiet', chevron: false });
  const buttons = { pause, reset, check, solution };
  const handlers = { pause: onPause, reset: onReset, check: onCheckShadow, solution: onShowSolution };
  for (const name of BUTTONS) {
    buttons[name].dataset.hud = name;
    buttons[name].addEventListener('click', event => {
      if (buttons[name].getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
      handlers[name]?.(event);
    });
  }
  const toolbar = h('div', { class: 'mp-ghud__toolbar', role: 'group', 'aria-label': 'Game controls' }, reset, pause);
  const actions = h('div', { class: 'mp-ghud__actions', role: 'group', 'aria-label': 'Puzzle actions' }, check, solution);

  // ── Control hints (bottom-left) ──
  const hintItems = new Map();
  const hints = h('ul', { class: 'mp-ghud__hints', 'aria-label': 'Object controls' },
    CONTROL_HINTS.map(hint => {
      const cap = hint.keys ? keyHint({ keys: hint.keys, text: hint.text })
        : h('span', { class: 'mp-key-hint' }, h('span', { class: 'mp-key mp-ghud__mouse' }, hint.mouse), hint.text);
      cap.querySelector(hint.keys ? 'kbd:last-of-type' : '.mp-ghud__mouse').after(' '); // a real space, so screen readers say "R Rotate", not "RRotate" (layout ignores it: flex gap)
      const item = h('li', { class: 'mp-ghud__hint', title: hint.title, 'data-hint': hint.id }, cap);
      hintItems.set(hint.id, item);
      return item;
    }));
  hints.hidden = !hintsVisible;

  const el = h('section', { class: cx('mp-ghud'), 'aria-label': 'Gameplay HUD', 'data-state': state },
    h('div', { class: 'mp-ghud__frame' },
      h('header', { class: 'mp-ghud__header' }, level, card, toolbar),
      h('div', { class: 'mp-ghud__viewport', 'aria-hidden': 'true' }), // empty on purpose: the 3D viewport shows through
      h('footer', { class: 'mp-ghud__footer' }, hints, actions)));

  el.buttons = buttons;
  el.setLevel = ({ number, name } = {}) => {
    title.lastChild.textContent = `Level ${formatLevel(number)}`;
    nameEl.textContent = name || '';
    nameEl.hidden = !name;
  };
  el.setMatch = (value, { state: nextState, message } = {}) => {
    paintMatch(value);
    if (nextState !== undefined || message !== undefined) setStatus(nextState ?? state, message);
  };
  el.setDisabled = (name, disabled = true) => {
    if (!BUTTONS.includes(name)) throw new TypeError(`Unknown HUD button "${name}". Available: ${BUTTONS.join(', ')}`);
    if (disabled) buttons[name].setAttribute('aria-disabled', 'true'); else buttons[name].removeAttribute('aria-disabled');
  };
  el.setHintsVisible = visible => { hints.hidden = !visible; };
  el.setActiveControl = id => { for (const [key, item] of hintItems) { if (key === id) item.dataset.active = 'true'; else delete item.dataset.active; } };
  el.destroy = () => el.remove();
  return el;
}
