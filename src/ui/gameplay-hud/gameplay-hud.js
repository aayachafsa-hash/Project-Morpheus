// MORPHEUS UI, Step 4.1 (visual layer) + Step 4.2 (interaction): the solo gameplay HUD.
//
//   import { gameplayHud } from './src/ui/gameplay-hud/index.js';
//   const hud = gameplayHud({ levelNumber: 3, levelName: 'Aquafish', onPause, onReset, onCheckShadow, onShowSolution });
//   container.append(hud);          // the HUD fills its container (position: absolute; inset: 0)
//   hud.setMatch(82, { state: 'close' });
//   hud.setHandlers({ onCheckShadow: () => bridge.check() });   // callbacks can also be (re)bound later
//
// Display + callbacks only. It renders what it is given and calls the callbacks it is given. It never reads the scene
// or the gameplay state, never computes a match, a score or a threshold, never listens to the keyboard (the gameplay
// owns R / Shift / Z / wheel; the hints below are text), never calls the screen manager and is not wired into main.js.
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
/** The four HUD button names, as used by setDisabled and data-hud. (Tab order is reset, pause, check, solution.) */
export const HUD_BUTTONS = Object.freeze([...BUTTONS]);
const HANDLER_OPTIONS = Object.freeze({ pause: 'onPause', reset: 'onReset', check: 'onCheckShadow', solution: 'onShowSolution' });
/** Default lockout after an accepted click, per button. Absorbs double-clicks and the repeat rate of a held Enter key. */
export const DEFAULT_REPEAT_GUARD_MS = 400;
const defaultNow = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
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
 *   onPause, onReset, onCheckShadow, onShowSolution   click callbacks (all optional; anything that is not a function is ignored)
 *   onError(error, name)         called when a callback throws or its promise rejects (default: console.error)
 *   repeatGuardMs                lockout per button after an accepted click (default DEFAULT_REPEAT_GUARD_MS, 0 = off)
 *   now                          clock used by the lockout, () => ms (default performance.now; a test hook)
 *
 * methods
 *   setHandlers({ onPause?, onReset?, onCheckShadow?, onShowSolution? })   bind, replace or remove (null) callbacks later
 *   setLevel({ number, name })   setMatch(value, { state?, message? })   setMatchState(state, message?)
 *   setDisabled(name, disabled = true)   setHintsVisible(visible)   setActiveControl(id | null)   destroy()
 *   name is one of HUD_BUTTONS ('pause' | 'reset' | 'check' | 'solution'); el.buttons holds the four elements.
 *   Disabled buttons use aria-disabled (they stay focusable) and ignore clicks, like the kit's goldButton.
 *
 * click handling (per button)
 *   disabled -> ignored; no callback bound -> ignored; inside the repeat lockout -> ignored; otherwise the callback runs
 *   with the click event. If it returns a promise the button is aria-busy and ignores clicks until the promise settles.
 */
export function gameplayHud({
  levelNumber = null, levelName = '', match = null, matchState = 'idle', messages = {}, hintsVisible = true, headingLevel = 1,
  onPause, onReset, onCheckShadow, onShowSolution, onError, repeatGuardMs = DEFAULT_REPEAT_GUARD_MS, now = defaultNow,
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

  let state = 'idle', root = null;
  const setStatus = (nextState, message) => {
    state = MATCH_STATES.includes(nextState) ? nextState : 'idle';
    card.dataset.state = state;
    if (root) root.dataset.state = state;
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
  const lastRun = {}, busy = {};
  let destroyed = false;
  const reportError = (error, name) => {
    if (typeof onError !== 'function') { console.error(`[gameplay-hud] the "${name}" callback failed`, error); return; }
    try { onError(error, name); } catch { /* a faulty error handler must not break the HUD */ }
  };
  const release = name => { busy[name] = false; buttons[name].removeAttribute('aria-busy'); };
  const activate = (name, event) => {
    const button = buttons[name];
    if (button.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
    const handler = handlers[name];
    if (destroyed || busy[name] || typeof handler !== 'function') return; // missing callback: nothing to run, no lockout either
    const time = now();
    if (repeatGuardMs > 0 && lastRun[name] != null && time - lastRun[name] < repeatGuardMs) return;
    lastRun[name] = time;
    let result;
    try { result = handler(event); } catch (error) { reportError(error, name); return; }
    if (typeof result?.then === 'function') { // an async action stays busy until it settles
      busy[name] = true; button.setAttribute('aria-busy', 'true');
      result.then(() => release(name), error => { release(name); reportError(error, name); });
    }
  };
  for (const name of BUTTONS) {
    buttons[name].dataset.hud = name;
    buttons[name].addEventListener('click', event => activate(name, event));
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

  root = el;
  el.buttons = buttons;
  el.setHandlers = (next = {}) => {
    const known = Object.values(HANDLER_OPTIONS), unknown = Object.keys(next).filter(key => !known.includes(key));
    if (unknown.length) throw new TypeError(`Unknown HUD handler "${unknown[0]}". Available: ${known.join(', ')}`); // checked first: all or nothing
    for (const name of BUTTONS) if (HANDLER_OPTIONS[name] in next) handlers[name] = next[HANDLER_OPTIONS[name]];
  };
  el.setLevel = ({ number, name } = {}) => {
    title.lastChild.textContent = `Level ${formatLevel(number)}`;
    nameEl.textContent = name || '';
    nameEl.hidden = !name;
  };
  el.setMatch = (value, { state: nextState, message } = {}) => {
    paintMatch(value);
    if (nextState !== undefined || message !== undefined) setStatus(nextState ?? state, message);
  };
  el.setMatchState = (nextState, message) => setStatus(nextState, message);
  el.setDisabled = (name, disabled = true) => {
    if (!BUTTONS.includes(name)) throw new TypeError(`Unknown HUD button "${name}". Available: ${BUTTONS.join(', ')}`);
    if (disabled) buttons[name].setAttribute('aria-disabled', 'true'); else buttons[name].removeAttribute('aria-disabled');
  };
  el.setHintsVisible = visible => { hints.hidden = !visible; };
  el.setActiveControl = id => { for (const [key, item] of hintItems) { if (key === id) item.dataset.active = 'true'; else delete item.dataset.active; } };
  el.destroy = () => { destroyed = true; for (const name of BUTTONS) handlers[name] = undefined; el.remove(); };
  return el;
}
