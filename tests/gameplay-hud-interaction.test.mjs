// Step 4.2 tests: interaction of the gameplay HUD (callbacks, match feedback, active control, hints), in jsdom.
// Run: node tests/gameplay-hud-interaction.test.mjs   (needs `npm i jsdom` once, same as the other test files)
// Only mock callbacks are used: no Three.js, no gameplay engine, no main.js. The repeat lockout is tested with an
// injected clock, so nothing here depends on real time. jsdom has no layout or real pointer routing: the pointer
// pass-through is checked by reading the CSS and the JS source, and in the demo page (gameplay-hud-demo.html).
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const k of ['window', 'document', 'KeyboardEvent', 'MouseEvent', 'Event', 'HTMLElement']) globalThis[k] = k === 'window' ? dom.window : dom.window[k];
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.removeEventListener = (...a) => dom.window.removeEventListener(...a);
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

const root = new URL('..', import.meta.url).pathname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { gameplayHud, MATCH_STATES, DEFAULT_MESSAGES, CONTROL_HINTS, HUD_BUTTONS, DEFAULT_REPEAT_GUARD_MS } = await import('../src/ui/gameplay-hud/index.js');

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { failed++; process.exitCode = 1; console.error('  FAIL', name, '\n      ', e.message); }
};
const norm = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const mount = hud => { document.body.append(hud); return hud; };
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const q = (el, selector) => el.querySelector(selector);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const spy = (impl = () => {}) => { const fn = (...args) => { fn.calls.push(args); return impl(...args); }; fn.calls = []; return fn; };
const clock = (start = 1000) => { const c = () => c.t; c.t = start; c.advance = ms => { c.t += ms; }; return c; };
/** A HUD with four spies and a fake clock. */
const setup = (extra = {}) => {
  const spies = { onPause: spy(), onReset: spy(), onCheckShadow: spy(), onShowSolution: spy() };
  const now = clock();
  const hud = mount(gameplayHud({ levelNumber: 1, ...spies, now, ...extra }));
  return { hud, now, ...spies };
};
const cssSource = read('src/ui/gameplay-hud/gameplay-hud.css');
const jsSource = read('src/ui/gameplay-hud/gameplay-hud.js');
const jsCode = jsSource.replace(/\/\/.*$/gm, '');

console.log('Callbacks: each button invokes its own callback');
await test('Pause, Reset, Check Shadow and Show Solution each call exactly their own callback, once', () => {
  const t = setup(); const all = ['onPause', 'onReset', 'onCheckShadow', 'onShowSolution'];
  for (const [button, callback] of [['pause', 'onPause'], ['reset', 'onReset'], ['check', 'onCheckShadow'], ['solution', 'onShowSolution']]) {
    const before = all.map(name => t[name].calls.length);
    click(t.hud.buttons[button]);
    assert.deepEqual(all.map((name, i) => t[name].calls.length - before[i]), all.map(name => (name === callback ? 1 : 0)), button);
  }
});
await test('the callback receives the click event and is called by a native .click() too', () => {
  const t = setup();
  t.hud.buttons.check.click();
  assert.equal(t.onCheckShadow.calls.length, 1);
  assert.equal(t.onCheckShadow.calls[0][0].type, 'click');
});
await test('callbacks are looked up at click time: setHandlers binds late, replaces, and removes with null', () => {
  const t = setup({ onPause: undefined, onReset: undefined, onCheckShadow: undefined, onShowSolution: undefined });
  const first = spy(), second = spy();
  click(t.hud.buttons.reset); // nothing bound yet
  t.hud.setHandlers({ onReset: first }); click(t.hud.buttons.reset);
  assert.equal(first.calls.length, 1);
  t.now.advance(DEFAULT_REPEAT_GUARD_MS); t.hud.setHandlers({ onReset: second }); click(t.hud.buttons.reset);
  assert.equal(first.calls.length, 1); assert.equal(second.calls.length, 1);
  t.now.advance(DEFAULT_REPEAT_GUARD_MS); t.hud.setHandlers({ onReset: null }); click(t.hud.buttons.reset);
  assert.equal(second.calls.length, 1);
});
await test('setHandlers changes only the keys it is given', () => {
  const t = setup(); const replacement = spy();
  t.hud.setHandlers({ onPause: replacement });
  click(t.hud.buttons.pause); click(t.hud.buttons.reset);
  assert.equal(replacement.calls.length, 1); assert.equal(t.onPause.calls.length, 0); assert.equal(t.onReset.calls.length, 1);
});
await test('setHandlers rejects an unknown key and applies nothing from that call', () => {
  const t = setup(); const replacement = spy();
  assert.throws(() => t.hud.setHandlers({ onPause: replacement, onCheck: () => {} }), /Unknown HUD handler "onCheck"/);
  click(t.hud.buttons.pause);
  assert.equal(replacement.calls.length, 0); assert.equal(t.onPause.calls.length, 1);
});
await test('HUD_BUTTONS lists the four names and matches the data-hud attributes', () => {
  assert.deepEqual([...HUD_BUTTONS], ['pause', 'reset', 'check', 'solution']);
  const hud = mount(gameplayHud());
  assert.deepEqual(HUD_BUTTONS.map(name => hud.buttons[name].dataset.hud), [...HUD_BUTTONS]);
});

console.log('Missing and invalid callbacks');
await test('no callbacks at all: every button can be clicked, repeatedly, without an error', () => {
  const hud = mount(gameplayHud({ now: clock() }));
  for (let i = 0; i < 3; i++) for (const b of Object.values(hud.buttons)) click(b);
});
await test('callbacks that are not functions (string, number, object, null) are ignored', () => {
  const hud = mount(gameplayHud({ onPause: 'pause', onReset: 42, onCheckShadow: {}, onShowSolution: null, now: clock() }));
  for (const b of Object.values(hud.buttons)) click(b);
  hud.setHandlers({ onPause: 'nope', onReset: true }); click(hud.buttons.pause); click(hud.buttons.reset);
});
await test('a click with no callback does not start the lockout (a callback bound right after works at once)', () => {
  const hud = mount(gameplayHud({ now: clock() })); const late = spy();
  click(hud.buttons.check); hud.setHandlers({ onCheckShadow: late }); click(hud.buttons.check);
  assert.equal(late.calls.length, 1);
});
await test('a partial set of callbacks works: only the bound button acts', () => {
  const only = spy(); const hud = mount(gameplayHud({ onShowSolution: only, now: clock() }));
  for (const b of Object.values(hud.buttons)) click(b);
  assert.equal(only.calls.length, 1);
});

console.log('Repeated interactions');
await test('a second click inside the lockout is ignored; after it, the action runs again', () => {
  const t = setup();
  click(t.hud.buttons.check); click(t.hud.buttons.check); t.now.advance(DEFAULT_REPEAT_GUARD_MS - 1); click(t.hud.buttons.check);
  assert.equal(t.onCheckShadow.calls.length, 1);
  t.now.advance(1); click(t.hud.buttons.check);
  assert.equal(t.onCheckShadow.calls.length, 2);
});
await test('a burst of clicks (double-click, held Enter) runs the callback once per lockout window', () => {
  const t = setup();
  for (let i = 0; i < 20; i++) { click(t.hud.buttons.reset); t.now.advance(30); } // 600 ms of key repeat
  assert.equal(t.onReset.calls.length, 2);
});
await test('the lockout is per button: different actions are not blocked by each other', () => {
  const t = setup();
  click(t.hud.buttons.pause); click(t.hud.buttons.reset); click(t.hud.buttons.check); click(t.hud.buttons.solution);
  assert.deepEqual([t.onPause, t.onReset, t.onCheckShadow, t.onShowSolution].map(s => s.calls.length), [1, 1, 1, 1]);
});
await test('repeatGuardMs: 0 turns the lockout off; a custom value is honoured', () => {
  const off = setup({ repeatGuardMs: 0 });
  click(off.hud.buttons.pause); click(off.hud.buttons.pause); assert.equal(off.onPause.calls.length, 2);
  const custom = setup({ repeatGuardMs: 50 });
  click(custom.hud.buttons.pause); custom.now.advance(49); click(custom.hud.buttons.pause); custom.now.advance(1); click(custom.hud.buttons.pause);
  assert.equal(custom.onPause.calls.length, 2);
});
await test('the default lockout is 400 ms and is exported', () => assert.equal(DEFAULT_REPEAT_GUARD_MS, 400));
await test('a disabled button ignores clicks without starting the lockout; enabling it makes it work at once', () => {
  const t = setup();
  t.hud.setDisabled('check'); click(t.hud.buttons.check); click(t.hud.buttons.check);
  assert.equal(t.onCheckShadow.calls.length, 0);
  t.hud.setDisabled('check', false); click(t.hud.buttons.check);
  assert.equal(t.onCheckShadow.calls.length, 1);
});
await test('a disabled click is default-prevented; an accepted click is not (the HUD never swallows events)', () => {
  const t = setup();
  const accepted = new MouseEvent('click', { bubbles: true, cancelable: true }); t.hud.buttons.pause.dispatchEvent(accepted);
  assert.equal(accepted.defaultPrevented, false);
  t.hud.setDisabled('reset'); const blocked = new MouseEvent('click', { bubbles: true, cancelable: true }); t.hud.buttons.reset.dispatchEvent(blocked);
  assert.equal(blocked.defaultPrevented, true);
});
await test('a callback may drive the HUD re-entrantly (setMatchState, setDisabled on its own button) without recursion', () => {
  const t = setup();
  t.hud.setHandlers({ onCheckShadow: () => { t.hud.setMatchState('checking'); t.hud.setDisabled('check'); click(t.hud.buttons.check); } });
  click(t.hud.buttons.check);
  assert.equal(q(t.hud, '.mp-ghud__match').dataset.state, 'checking'); assert.equal(t.hud.buttons.check.getAttribute('aria-disabled'), 'true');
});

console.log('Async callbacks (busy state)');
await test('a callback that returns a promise keeps its button aria-busy and ignores clicks until it settles', async () => {
  const t = setup({ repeatGuardMs: 0 }); let finish;
  t.hud.setHandlers({ onCheckShadow: spy(() => new Promise(resolve => { finish = resolve; })) });
  click(t.hud.buttons.check);
  assert.equal(t.hud.buttons.check.getAttribute('aria-busy'), 'true');
  click(t.hud.buttons.check); click(t.hud.buttons.check);
  assert.equal(t.hud.buttons.check.getAttribute('aria-busy'), 'true');
  finish(); await tick();
  assert.equal(t.hud.buttons.check.hasAttribute('aria-busy'), false);
});
await test('while one button is busy the others still work; the busy button stays focusable', async () => {
  const t = setup(); let finish; const run = spy(() => new Promise(resolve => { finish = resolve; }));
  t.hud.setHandlers({ onCheckShadow: run }); click(t.hud.buttons.check); click(t.hud.buttons.reset);
  assert.equal(t.onReset.calls.length, 1); assert.equal(run.calls.length, 1);
  t.hud.buttons.check.focus(); assert.equal(document.activeElement, t.hud.buttons.check); assert.equal(t.hud.buttons.check.disabled, false);
  finish(); await tick();
});
await test('after the promise settles and the lockout passes, the action can run again', async () => {
  const t = setup(); const run = spy(() => Promise.resolve());
  t.hud.setHandlers({ onShowSolution: run }); click(t.hud.buttons.solution); await tick();
  click(t.hud.buttons.solution); assert.equal(run.calls.length, 1, 'still inside the lockout');
  t.now.advance(DEFAULT_REPEAT_GUARD_MS); click(t.hud.buttons.solution); assert.equal(run.calls.length, 2);
});
await test('a rejected promise releases the button and is reported to onError with the button name', async () => {
  const errors = []; const t = setup({ onError: (error, name) => errors.push([error.message, name]) });
  t.hud.setHandlers({ onCheckShadow: () => Promise.reject(new Error('boom')) });
  click(t.hud.buttons.check); await tick();
  assert.deepEqual(errors, [['boom', 'check']]); assert.equal(t.hud.buttons.check.hasAttribute('aria-busy'), false);
});
await test('a synchronous throw is reported to onError and the HUD keeps working', () => {
  const errors = []; const t = setup({ onError: (error, name) => errors.push([error.message, name]) });
  t.hud.setHandlers({ onReset: () => { throw new Error('bad reset'); } });
  click(t.hud.buttons.reset); t.now.advance(DEFAULT_REPEAT_GUARD_MS); click(t.hud.buttons.pause);
  assert.deepEqual(errors, [['bad reset', 'reset']]); assert.equal(t.onPause.calls.length, 1);
});
await test('without onError a failing callback is logged with console.error, not thrown', () => {
  const original = console.error; const logged = []; console.error = (...a) => logged.push(a);
  try {
    const t = setup(); t.hud.setHandlers({ onPause: () => { throw new Error('x'); } });
    click(t.hud.buttons.pause);
  } finally { console.error = original; }
  assert.equal(logged.length, 1); assert.match(String(logged[0][0]), /"pause" callback failed/);
});
await test('an onError handler that throws does not break the HUD', () => {
  const t = setup({ onError: () => { throw new Error('handler bug'); } });
  t.hud.setHandlers({ onPause: () => { throw new Error('x'); } });
  click(t.hud.buttons.pause); t.now.advance(DEFAULT_REPEAT_GUARD_MS); click(t.hud.buttons.reset);
  assert.equal(t.onReset.calls.length, 1);
});
await test('destroy: later clicks do nothing, and a promise that settles afterwards is harmless', async () => {
  const t = setup(); let finish; const run = spy(() => new Promise(resolve => { finish = resolve; }));
  t.hud.setHandlers({ onCheckShadow: run }); click(t.hud.buttons.check);
  t.hud.destroy(); finish(); await tick();
  t.now.advance(DEFAULT_REPEAT_GUARD_MS); click(t.hud.buttons.check); click(t.hud.buttons.pause);
  assert.equal(run.calls.length, 1); assert.equal(t.onPause.calls.length, 0); assert.equal(document.body.contains(t.hud), false);
});

console.log('Match feedback states');
await test('MATCH_STATES is exactly idle, checking, close, match, miss', () => assert.deepEqual([...MATCH_STATES], ['idle', 'checking', 'close', 'match', 'miss']));
await test('setMatchState sets data-state on the card AND the HUD root, with that state\'s default message', () => {
  const hud = mount(gameplayHud()); const card = q(hud, '.mp-ghud__match');
  for (const state of MATCH_STATES) {
    hud.setMatchState(state);
    assert.equal(card.dataset.state, state); assert.equal(hud.dataset.state, state);
    assert.equal(norm(q(hud, '.mp-ghud__status-text')), DEFAULT_MESSAGES[state]);
  }
});
await test('the matchState option sets the initial state on both elements', () => {
  const hud = mount(gameplayHud({ matchState: 'close' }));
  assert.equal(q(hud, '.mp-ghud__match').dataset.state, 'close'); assert.equal(hud.dataset.state, 'close');
});
await test('setMatchState changes the state but not the value or the meter', () => {
  const hud = mount(gameplayHud({ match: 64 }));
  hud.setMatchState('checking');
  assert.equal(norm(q(hud, '.mp-stat__value')), '64%'); assert.equal(q(hud, '[role="meter"]').getAttribute('aria-valuenow'), '64');
});
await test('a custom message applies to that state only; the next state without a message gets its default', () => {
  const hud = mount(gameplayHud()); const text = () => norm(q(hud, '.mp-ghud__status-text'));
  hud.setMatchState('close', 'Almost there'); assert.equal(text(), 'Almost there');
  hud.setMatchState('miss'); assert.equal(text(), DEFAULT_MESSAGES.miss);
});
await test('the `messages` option is used by setMatchState', () => {
  const hud = mount(gameplayHud({ messages: { checking: 'Measuring…' } }));
  hud.setMatchState('checking'); assert.equal(norm(q(hud, '.mp-ghud__status-text')), 'Measuring…');
});
await test('an unknown state falls back to idle; an empty or non-string message falls back to the default', () => {
  const hud = mount(gameplayHud());
  hud.setMatchState('banana'); assert.equal(q(hud, '.mp-ghud__match').dataset.state, 'idle'); assert.equal(hud.dataset.state, 'idle');
  hud.setMatchState('miss', ''); assert.equal(norm(q(hud, '.mp-ghud__status-text')), DEFAULT_MESSAGES.miss);
  hud.setMatchState('match', 7); assert.equal(norm(q(hud, '.mp-ghud__status-text')), DEFAULT_MESSAGES.match);
  hud.setMatchState(undefined); assert.equal(q(hud, '.mp-ghud__match').dataset.state, 'idle');
});
await test('a realistic check sequence: idle -> checking -> close -> match, then miss, updates value, state and message together', () => {
  const hud = mount(gameplayHud()); const card = q(hud, '.mp-ghud__match');
  const seen = () => [card.dataset.state, norm(q(hud, '.mp-stat__value')), norm(q(hud, '.mp-ghud__status-text'))];
  assert.deepEqual(seen(), ['idle', '—', DEFAULT_MESSAGES.idle]);
  hud.setMatchState('checking'); assert.deepEqual(seen(), ['checking', '—', DEFAULT_MESSAGES.checking]);
  hud.setMatch(78, { state: 'close' }); assert.deepEqual(seen(), ['close', '78%', DEFAULT_MESSAGES.close]);
  hud.setMatch(97, { state: 'match' }); assert.deepEqual(seen(), ['match', '97%', DEFAULT_MESSAGES.match]);
  hud.setMatch(31, { state: 'miss', message: 'Try rotating' }); assert.deepEqual(seen(), ['miss', '31%', 'Try rotating']);
});
await test('only the "match" state shows the check icon; the meter gets the value for every state', () => {
  const hud = mount(gameplayHud({ match: 50 })); const icon = q(hud, '.mp-ghud__status-icon');
  for (const state of MATCH_STATES) { hud.setMatchState(state); assert.equal(icon.hidden, state !== 'match', state); assert.equal(q(hud, '.mp-ghud__meter-fill').style.getPropertyValue('--mp-ghud-match'), '50'); }
});
await test('repeating the same state and message does not rewrite the status text (no repeated announcements)', async () => {
  const hud = mount(gameplayHud()); hud.setMatchState('checking');
  const node = q(hud, '.mp-ghud__status-text'); let writes = 0;
  new dom.window.MutationObserver(() => writes++).observe(node, { childList: true, characterData: true, subtree: true });
  for (let i = 0; i < 5; i++) hud.setMatchState('checking');
  await tick(); assert.equal(writes, 0);
});
await test('the HUD never derives a state from a value or from a click: Check Shadow alone changes no feedback', () => {
  const t = setup({ match: 99 });
  click(t.hud.buttons.check);
  assert.equal(q(t.hud, '.mp-ghud__match').dataset.state, 'idle'); assert.equal(norm(q(t.hud, '.mp-stat__value')), '99%');
  assert.ok(!/state\s*=\s*'(checking|match|close|miss)'/.test(jsCode.replace(/\s+/g, ' ')), 'no hardcoded state transitions in the source');
});

console.log('Active control and hints visibility');
await test('setActiveControl highlights exactly the requested hint, for every control id', () => {
  const hud = mount(gameplayHud());
  for (const { id } of CONTROL_HINTS) {
    hud.setActiveControl(id);
    assert.deepEqual([...hud.querySelectorAll('[data-active="true"]')].map(li => li.dataset.hint), [id]);
  }
});
await test('null, an unknown id and a non-string clear the highlight instead of throwing', () => {
  const hud = mount(gameplayHud());
  for (const value of [null, undefined, 'nope', 3, {}]) {
    hud.setActiveControl('rotate'); assert.equal(hud.querySelectorAll('[data-active]').length, 1);
    hud.setActiveControl(value); assert.equal(hud.querySelectorAll('[data-active]').length, 0, String(value));
  }
});
await test('setting the same active control repeatedly is idempotent', () => {
  const hud = mount(gameplayHud());
  for (let i = 0; i < 4; i++) hud.setActiveControl('height');
  assert.deepEqual([...hud.querySelectorAll('[data-active="true"]')].map(li => li.dataset.hint), ['height']);
});
await test('hints can be hidden and shown any number of times; the list stays in the DOM and keeps its content', () => {
  const hud = mount(gameplayHud()); const list = q(hud, '.mp-ghud__hints');
  for (const visible of [false, false, true, true, false, true]) { hud.setHintsVisible(visible); assert.equal(list.hidden, !visible); assert.equal(list.children.length, CONTROL_HINTS.length); assert.ok(hud.contains(list)); }
});
await test('hiding hints keeps the active highlight, and highlighting works while hints are hidden', () => {
  const hud = mount(gameplayHud({ hintsVisible: false })); const list = q(hud, '.mp-ghud__hints');
  hud.setActiveControl('rotate'); hud.setHintsVisible(true);
  assert.equal(list.hidden, false); assert.equal(q(hud, '[data-hint="rotate"]').dataset.active, 'true');
});
await test('hiding the hints does not affect the four buttons', () => {
  const t = setup(); t.hud.setHintsVisible(false);
  for (const b of Object.values(t.hud.buttons)) { assert.equal(b.hidden, false); click(b); }
  assert.deepEqual([t.onPause, t.onReset, t.onCheckShadow, t.onShowSolution].map(s => s.calls.length), [1, 1, 1, 1]);
});

console.log('Existing HUD behaviour is intact');
await test('the Step 4.1 surface is unchanged: options, buttons, tab order, level, match value, hint list', () => {
  const hud = mount(gameplayHud({ levelNumber: 3, levelName: 'Aquafish', match: 82 }));
  assert.equal(norm(q(hud, 'h1')), 'Level 03'); assert.equal(norm(q(hud, '.mp-stat__value')), '82%');
  assert.deepEqual([...hud.querySelectorAll('button')].map(b => b.dataset.hud), ['reset', 'pause', 'check', 'solution']);
  assert.deepEqual([...q(hud, 'ul.mp-ghud__hints').children].map(li => norm(li)), ['Drag Move', 'R Rotate', 'Shift Tilt', 'Z Height', 'Wheel Depth']);
  for (const method of ['setLevel', 'setMatch', 'setDisabled', 'setHintsVisible', 'setActiveControl', 'destroy']) assert.equal(typeof hud[method], 'function', method);
});
await test('every button keeps its accessible name, type="button" and no positive tabindex', () => {
  const hud = mount(gameplayHud());
  const names = [...hud.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || norm(b));
  assert.deepEqual(names, ['Reset puzzle', 'Pause game', 'Check Shadow', 'Show Solution']);
  for (const b of hud.querySelectorAll('button')) { assert.equal(b.getAttribute('type'), 'button'); assert.ok(!b.hasAttribute('tabindex') || Number(b.getAttribute('tabindex')) <= 0); }
});
await test('keyboard: buttons are reachable by focus and keep focus after being activated (native Enter/Space produce clicks)', () => {
  const t = setup();
  for (const b of Object.values(t.hud.buttons)) { b.focus(); assert.equal(document.activeElement, b); b.click(); assert.equal(document.activeElement, b); }
});
await test('setDisabled still uses aria-disabled (focusable) and still rejects unknown names', () => {
  const hud = mount(gameplayHud()); hud.setDisabled('solution');
  assert.equal(hud.buttons.solution.getAttribute('aria-disabled'), 'true'); assert.equal(hud.buttons.solution.disabled, false);
  assert.throws(() => hud.setDisabled('nope'), /Unknown HUD button/);
});

console.log('Boundaries: pointer events, keyboard, independence');
await test('the HUD binds no pointer, mouse, touch, wheel or key listeners and never stops propagation', () => {
  assert.deepEqual([...jsCode.matchAll(/addEventListener\(\s*'([^']+)'/g)].map(m => m[1]), ['click'], 'the only listener the HUD adds is click, on its own buttons');
  assert.ok(!/stopPropagation|stopImmediatePropagation|setPointerCapture|releasePointerCapture/.test(jsCode));
});
await test('CSS: the HUD is transparent to the pointer; only the buttons opt back in; the busy style does not change that', () => {
  const rules = [...cssSource.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*pointer-events[^}]*)\}/g)].map(m => [m[1].trim(), m[2].match(/pointer-events:\s*(\w+)/)[1]]);
  assert.deepEqual(rules, [['.mp-ghud', 'none'], ['.mp-ghud :is(.mp-btn, .mp-icon-btn)', 'auto']]);
  assert.match(cssSource, /\[aria-busy="true"\]/);
});
await test('interacting with every control adds no document or window listeners', async () => {
  const counts = { doc: 0, win: 0 };
  const origDoc = document.addEventListener, origWin = dom.window.addEventListener;
  document.addEventListener = (...a) => { counts.doc++; return origDoc.apply(document, a); };
  dom.window.addEventListener = (...a) => { counts.win++; return origWin.apply(dom.window, a); };
  try {
    const t = setup({ repeatGuardMs: 0 });
    t.hud.setHandlers({ onCheckShadow: () => Promise.resolve() });
    for (const b of Object.values(t.hud.buttons)) click(b);
    t.hud.setMatchState('checking'); t.hud.setMatch(40, { state: 'miss' }); t.hud.setActiveControl('depth'); t.hud.setHintsVisible(false); t.hud.destroy();
    await tick();
  } finally { document.addEventListener = origDoc; dom.window.addEventListener = origWin; }
  assert.deepEqual(counts, { doc: 0, win: 0 });
});
await test('a key event dispatched on the page reaches nobody inside the HUD: the HUD does not react to R, Z, Shift or Escape', () => {
  const t = setup(); let seenByPage = 0; document.addEventListener('keydown', () => seenByPage++);
  for (const key of ['r', 'z', 'Shift', 'Escape', 'Enter']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  assert.equal(seenByPage, 5);
  assert.deepEqual([t.onPause, t.onReset, t.onCheckShadow, t.onShowSolution].map(s => s.calls.length), [0, 0, 0, 0]);
  assert.equal(q(t.hud, '[data-active]'), null);
});
await test('the source still imports only the UI kit and names no gameplay, scene, engine or manager API', () => {
  const imports = [...jsCode.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['../components/index.js', '../dom.js', '../icons.js']);
  assert.ok(!/three|THREE|main\.js|createScreenManager|ui\.(go|open|back)\b|localStorage|fetch\(|requestAnimationFrame|document\.|window\./.test(jsCode));
});
await test('Step 4.2 does not integrate the HUD: main.js, index.html, style.css and the Step 1 index do not mention it', () => {
  for (const file of ['src/main.js', 'index.html', 'style.css', 'src/ui/index.js']) assert.ok(!/gameplay-hud|gameplayHud/.test(read(file)), file);
});

console.log('Demo page');
await test('the demo wires the HUD through callbacks and setHandlers only, and still loads no Three.js, main.js or canvas', () => {
  const html = read('gameplay-hud-demo.html'); const page = new JSDOM(html).window.document; const script = read('gameplay-hud-demo.js');
  for (const id of ['viewport', 'canvas', 'log', 'bind', 'async', 'throws', 'outcome']) assert.ok(page.getElementById(id), `missing #${id}`);
  assert.equal(page.querySelectorAll('canvas').length, 0);
  assert.deepEqual([...script.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]), ['./src/ui/index.js', './src/ui/gameplay-hud/index.js']);
  assert.match(script, /setHandlers/); assert.match(script, /onPause/); assert.match(script, /setMatchState/);
  const loaded = [...page.querySelectorAll('script[src], link[href]')].map(e => e.getAttribute('src') || e.getAttribute('href'));
  assert.ok(!loaded.some(u => /three|main\.js/i.test(u)), `the demo must not load Three.js or main.js: ${loaded}`);
  assert.ok(!/three|main\.js/i.test(script.replace(/\/\/.*$/gm, '')), 'no engine reference in the demo code');
});

console.log(`\n${passed} passed, ${failed} failed`);
