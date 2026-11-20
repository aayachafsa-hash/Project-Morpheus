// Step 4.1 tests: rendering and structure of the gameplay HUD, in jsdom.
// Run: node tests/gameplay-hud.test.mjs   (needs `npm i jsdom` once, same as the Step 1/2/3 tests)
// jsdom has no layout, so the responsive layout and the real focus ring are checked by reading the CSS source and in the
// demo page (gameplay-hud-demo.html); this file does not claim to test pixels.
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
const { gameplayHud, CONTROL_HINTS, MATCH_STATES, DEFAULT_MESSAGES } = await import('../src/ui/gameplay-hud/index.js');
const { createScreenManager } = await import('../src/ui/index.js');

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { failed++; process.exitCode = 1; console.error('  FAIL', name, '\n      ', e.message); }
};
const norm = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const mount = hud => { document.body.append(hud); return hud; };
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const q = (el, selector) => el.querySelector(selector);
const buttonNamed = (hud, name) => [...hud.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || norm(b)) === name);
const cssSource = read('src/ui/gameplay-hud/gameplay-hud.css');
const jsSource = read('src/ui/gameplay-hud/gameplay-hud.js');

console.log('Structure');
await test('renders a named region with the level title and name', () => {
  const hud = mount(gameplayHud({ levelNumber: 3, levelName: 'Aquafish' }));
  assert.equal(hud.tagName, 'SECTION');
  assert.equal(hud.getAttribute('aria-label'), 'Gameplay HUD');
  assert.equal(norm(q(hud, 'h1')), 'Level 03');
  assert.equal(norm(q(hud, '.mp-ghud__level-name')), 'Aquafish');
});
await test('level without a name or number degrades cleanly', () => {
  const hud = mount(gameplayHud());
  assert.equal(norm(q(hud, 'h1')), 'Level —');
  assert.equal(q(hud, '.mp-ghud__level-name').hidden, true);
});
await test('headingLevel option is honoured', () => {
  assert.ok(q(mount(gameplayHud({ headingLevel: 2 })), 'h2.mp-screen-title'));
});
await test('the four required buttons exist as native, labelled <button type="button">', () => {
  const hud = mount(gameplayHud());
  for (const name of ['Pause game', 'Reset puzzle', 'Check Shadow', 'Show Solution']) {
    const b = buttonNamed(hud, name);
    assert.ok(b, `missing ${name}`);
    assert.equal(b.tagName, 'BUTTON'); assert.equal(b.getAttribute('type'), 'button');
  }
  assert.equal(hud.querySelectorAll('button').length, 4);
});
await test('buttons reuse the kit components and are visually distinguishable by class', () => {
  const hud = mount(gameplayHud());
  assert.ok(hud.buttons.check.classList.contains('mp-btn--teal'));
  assert.ok(hud.buttons.solution.classList.contains('mp-btn--quiet'));
  assert.ok(hud.buttons.pause.classList.contains('mp-icon-btn') && hud.buttons.reset.classList.contains('mp-icon-btn'));
  assert.ok(q(hud, '.mp-hud-card.mp-ghud__match'), 'match area is the kit hudCard');
});
await test('DOM (tab) order: reset, pause, check shadow, show solution', () => {
  const hud = mount(gameplayHud());
  assert.deepEqual([...hud.querySelectorAll('button')].map(b => b.dataset.hud), ['reset', 'pause', 'check', 'solution']);
});
await test('no element is removed from the tab order and none has a positive tabindex', () => {
  const hud = mount(gameplayHud());
  for (const el of hud.querySelectorAll('[tabindex]')) assert.ok(Number(el.getAttribute('tabindex')) <= 0 && el.tagName !== 'BUTTON', 'unexpected tabindex');
});
await test('the viewport slot is empty and hidden from assistive tech', () => {
  const slot = q(mount(gameplayHud()), '.mp-ghud__viewport');
  assert.equal(slot.children.length, 0); assert.equal(slot.getAttribute('aria-hidden'), 'true');
});

console.log('Actions');
await test('each button calls only its own callback, once per click', () => {
  const calls = [];
  const hud = mount(gameplayHud({ onPause: () => calls.push('pause'), onReset: () => calls.push('reset'), onCheckShadow: () => calls.push('check'), onShowSolution: () => calls.push('solution') }));
  for (const name of ['pause', 'reset', 'check', 'solution']) click(hud.buttons[name]);
  assert.deepEqual(calls, ['pause', 'reset', 'check', 'solution']);
});
await test('missing callbacks do not throw', () => {
  const hud = mount(gameplayHud());
  for (const b of Object.values(hud.buttons)) click(b);
});
await test('a disabled button ignores clicks, announces aria-disabled and stays focusable', () => {
  let n = 0;
  const hud = mount(gameplayHud({ onCheckShadow: () => n++, onPause: () => n++ }));
  hud.setDisabled('check'); hud.setDisabled('pause');
  click(hud.buttons.check); click(hud.buttons.pause);
  assert.equal(n, 0);
  for (const name of ['check', 'pause']) { assert.equal(hud.buttons[name].getAttribute('aria-disabled'), 'true'); assert.ok(!hud.buttons[name].disabled); }
  hud.buttons.check.focus(); assert.equal(document.activeElement, hud.buttons.check);
  hud.setDisabled('check', false); click(hud.buttons.check); assert.equal(n, 1);
});
await test('setDisabled rejects an unknown button name', () => {
  assert.throws(() => gameplayHud().setDisabled('nope'), /Unknown HUD button/);
});
await test('the HUD binds no key listeners of its own (buttons are native, so Enter/Space activate them)', () => {
  assert.ok(!/keydown|keyup|keypress|addEventListener\(\s*['"]key/.test(jsSource), 'the HUD must not bind keys');
});

console.log('Level');
await test('setLevel updates title and name, and clears the name', () => {
  const hud = mount(gameplayHud({ levelNumber: 1, levelName: 'A' }));
  hud.setLevel({ number: 12, name: 'Crescent' });
  assert.equal(norm(q(hud, 'h1')), 'Level 12'); assert.equal(norm(q(hud, '.mp-ghud__level-name')), 'Crescent');
  assert.ok(q(hud, 'h1 svg'), 'chevron icon is kept');
  hud.setLevel({ number: 5 }); assert.equal(q(hud, '.mp-ghud__level-name').hidden, true);
});

console.log('Shadow match feedback');
await test('shows a value as a percentage and "—" when there is none', () => {
  const hud = mount(gameplayHud({ match: 82 }));
  assert.equal(norm(q(hud, '.mp-stat__value')), '82%');
  hud.setMatch(null); assert.equal(norm(q(hud, '.mp-stat__value')), '—');
});
await test('the meter exposes role=meter with 0–100 and clamps out-of-range or invalid input', () => {
  const hud = mount(gameplayHud({ match: 40 }));
  const meter = q(hud, '[role="meter"]');
  assert.equal(meter.getAttribute('aria-label'), 'Shadow match');
  assert.equal(meter.getAttribute('aria-valuemin'), '0'); assert.equal(meter.getAttribute('aria-valuemax'), '100');
  assert.equal(meter.getAttribute('aria-valuenow'), '40');
  hud.setMatch(140); assert.equal(meter.getAttribute('aria-valuenow'), '100');
  hud.setMatch(-5); assert.equal(meter.getAttribute('aria-valuenow'), '0');
  hud.setMatch(Number.NaN); assert.equal(meter.getAttribute('aria-valuetext'), 'Not measured yet');
  hud.setMatch('82'); assert.equal(norm(q(hud, '.mp-stat__value')), '—', 'strings are not numbers');
});
await test('the meter fill follows the value through a CSS variable', () => {
  const hud = mount(gameplayHud({ match: 25 }));
  assert.equal(q(hud, '.mp-ghud__meter-fill').style.getPropertyValue('--mp-ghud-match'), '25');
});
await test('every state sets data-state and its default message; unknown states fall back to idle', () => {
  const hud = mount(gameplayHud());
  const card = q(hud, '.mp-ghud__match');
  for (const state of MATCH_STATES) { hud.setMatch(50, { state }); assert.equal(card.dataset.state, state); assert.equal(norm(q(hud, '.mp-ghud__status-text')), DEFAULT_MESSAGES[state]); }
  hud.setMatch(50, { state: 'banana' }); assert.equal(card.dataset.state, 'idle');
});
await test('a message override applies, a value-only update keeps state and message', () => {
  const hud = mount(gameplayHud());
  hud.setMatch(70, { state: 'close', message: 'Almost there' });
  hud.setMatch(75);
  assert.equal(q(hud, '.mp-ghud__match').dataset.state, 'close'); assert.equal(norm(q(hud, '.mp-ghud__status-text')), 'Almost there');
});
await test('the `messages` option replaces defaults per state', () => {
  assert.equal(norm(q(mount(gameplayHud({ messages: { idle: 'Hello' } })), '.mp-ghud__status-text')), 'Hello');
});
await test('the status line is a polite live region; the value <output> is not announced on every update', () => {
  const hud = mount(gameplayHud());
  assert.equal(q(hud, '.mp-ghud__status').getAttribute('role'), 'status');
  assert.equal(q(hud, 'output').getAttribute('aria-live'), 'off');
});
await test('unchanged status text is not rewritten (no repeated announcements while dragging)', () => {
  const hud = mount(gameplayHud());
  const node = q(hud, '.mp-ghud__status-text'); let writes = 0;
  new dom.window.MutationObserver(() => writes++).observe(node, { childList: true, characterData: true, subtree: true });
  for (let i = 0; i < 5; i++) hud.setMatch(i * 10, { state: 'idle' });
  return new Promise(resolve => setTimeout(() => { assert.equal(writes, 0); resolve(); }, 5));
});
await test('the success state shows a check icon only for "match"', () => {
  const hud = mount(gameplayHud());
  const icon = q(hud, '.mp-ghud__status-icon');
  assert.equal(icon.hidden, true); hud.setMatch(96, { state: 'match' }); assert.equal(icon.hidden, false); hud.setMatch(30, { state: 'miss' }); assert.equal(icon.hidden, true);
});

console.log('Control instructions');
await test('lists mouse drag, R, Shift, Z and mouse wheel with their actions', () => {
  const hud = mount(gameplayHud());
  const list = q(hud, 'ul.mp-ghud__hints');
  assert.equal(list.getAttribute('aria-label'), 'Object controls');
  assert.deepEqual([...list.children].map(li => norm(li)), ['Drag Move', 'R Rotate', 'Shift Tilt', 'Z Height', 'Wheel Depth']);
  assert.equal(CONTROL_HINTS.length, 5);
});
await test('keyboard keys are <kbd>; mouse actions are not', () => {
  const hud = mount(gameplayHud());
  const kbds = [...hud.querySelectorAll('.mp-ghud__hints kbd')].map(norm);
  assert.ok(kbds.includes('R') && kbds.includes('Shift') && kbds.includes('Z'));
  assert.ok(!kbds.includes('Drag') && !kbds.includes('Wheel'), 'mouse actions must not be <kbd>');
});
await test('every hint has a descriptive title', () => {
  for (const li of mount(gameplayHud()).querySelectorAll('.mp-ghud__hint')) assert.ok(li.title.length > 10);
});
await test('setHintsVisible and the hintsVisible option hide the hints', () => {
  const hud = mount(gameplayHud({ hintsVisible: false }));
  const list = q(hud, '.mp-ghud__hints'); assert.equal(list.hidden, true);
  hud.setHintsVisible(true); assert.equal(list.hidden, false);
});
await test('setActiveControl highlights exactly one hint, and null clears it', () => {
  const hud = mount(gameplayHud());
  hud.setActiveControl('rotate'); assert.deepEqual([...hud.querySelectorAll('[data-active="true"]')].map(li => li.dataset.hint), ['rotate']);
  hud.setActiveControl('height'); assert.deepEqual([...hud.querySelectorAll('[data-active="true"]')].map(li => li.dataset.hint), ['height']);
  hud.setActiveControl(null); assert.equal(hud.querySelectorAll('[data-active]').length, 0);
});

console.log('Boundaries');
await test('creating a HUD adds no document/window listeners and touches nothing outside itself', () => {
  const counts = { doc: 0, win: 0 };
  const origDoc = document.addEventListener, origWin = dom.window.addEventListener;
  document.addEventListener = (...a) => { counts.doc++; return origDoc.apply(document, a); };
  dom.window.addEventListener = (...a) => { counts.win++; return origWin.apply(dom.window, a); };
  const before = document.body.innerHTML;
  const hud = gameplayHud({ levelNumber: 1 });
  document.addEventListener = origDoc; dom.window.addEventListener = origWin;
  assert.deepEqual(counts, { doc: 0, win: 0 });
  assert.equal(document.body.innerHTML, before, 'building a HUD must not change the page until it is appended');
  hud.remove();
});
await test('the source imports only the UI kit and names no gameplay, scene or manager API', () => {
  const code = jsSource.replace(/\/\/.*$/gm, ''); // comments may legitimately mention the manager and main.js
  const imports = [...code.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['../components/index.js', '../dom.js', '../icons.js']);
  assert.ok(!/three|THREE|main\.js|createScreenManager|ui\.(go|open|back)\b|localStorage|fetch\(/.test(code));
});
await test('destroy removes the element', () => {
  const hud = mount(gameplayHud()); hud.destroy(); assert.equal(document.body.contains(hud), false);
});
await test('the HUD lives in src/ui/gameplay-hud/ and is not referenced from the Step 1 index, main.js or index.html', () => {
  assert.ok(fs.existsSync(path.join(root, 'src/ui/gameplay-hud/gameplay-hud.js')));
  assert.ok(!/gameplay-hud/.test(read('src/ui/index.js')), 'Step 1 index is untouched');
  assert.ok(!/gameplay-hud/.test(read('src/main.js')) && !/gameplay-hud/.test(read('index.html')), 'not integrated into main.js / index.html (Step 4.2)');
});

console.log('Stylesheet (read as source: jsdom has no layout)');
await test('the HUD is transparent to the pointer and only buttons opt back in', () => {
  assert.match(cssSource, /\.mp-ghud\s*\{[^}]*pointer-events:\s*none/);
  assert.match(cssSource, /\.mp-ghud :is\(\.mp-btn, \.mp-icon-btn\)\s*\{\s*pointer-events:\s*auto/);
});
await test('uses design tokens only: no raw hex colours, no font-family outside the tokens', () => {
  const hexes = cssSource.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hexes, ['#bdeff3', '#bdeff3', '#8be0e8'], `unexpected raw colours: ${hexes}`); // the same tints the kit's teal button/stat already use
  assert.ok(!/font-family/.test(cssSource));
});
await test('has visible focus, container-query responsiveness and reduced-motion rules', () => {
  assert.match(cssSource, /:focus-visible\s*\{[^}]*outline:\s*var\(--mp-focus-ring\)/);
  assert.match(cssSource, /@container mp-ghud \(max-width/); assert.match(cssSource, /@container mp-ghud \(max-height/);
  assert.match(cssSource, /prefers-reduced-motion: reduce/); assert.match(cssSource, /data-mp-reduce-motion="true"/);
  assert.match(cssSource, /safe-area-inset-top/);
});

console.log('Demo page');
await test('the demo page links the kit CSS and its module script, and every local file it references exists', () => {
  const html = read('gameplay-hud-demo.html');
  const page = new JSDOM(html).window.document;
  const hrefs = [...page.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href')).filter(h => h.startsWith('./'));
  assert.deepEqual(hrefs, ['./src/ui/tokens.css', './src/ui/ui.css', './src/ui/gameplay-hud/gameplay-hud.css']);
  const script = page.querySelector('script[type="module"]').getAttribute('src');
  for (const file of [...hrefs, script]) assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  assert.ok(page.querySelector('#viewport') && page.querySelector('#log'));
  const demoImports = [...read('gameplay-hud-demo.js').matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(demoImports, ['./src/ui/index.js', './src/ui/gameplay-hud/index.js'], 'the demo imports only the UI kit and the HUD');
  const loaded = [...page.querySelectorAll('script[src], link[href]')].map(e => e.getAttribute('src') || e.getAttribute('href'));
  assert.ok(!loaded.some(u => /three|main\.js/i.test(u)), `the demo page must not load Three.js or main.js: ${loaded}`);
  assert.equal(page.querySelectorAll('canvas').length, 0, 'the demo has no canvas / scene');
});
await test('the demo script imports resolve and only use exports that exist', () => {
  const src = read('gameplay-hud-demo.js');
  for (const rel of [...src.matchAll(/from\s+'(\.[^']+)'/g)].map(m => m[1])) assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
});

console.log('Compatibility with the Step 2 screen manager (test-only wiring, not part of the HUD)');
await test('a key-passthrough screen can host the HUD; Pause can open an overlay without any HUD knowledge of the manager', async () => {
  const ui = createScreenManager({ root: document.body, transitionMs: 0, reducedMotion: () => true });
  let hud;
  ui.register({ id: 'game', to: ['pause'], keys: 'passthrough', history: false, backdrop: false,
    create: ctx => { hud = gameplayHud({ levelNumber: 1, onPause: () => ctx.manager.open('pause') }); return { el: hud }; } });
  ui.register({ id: 'pause', to: [], presentation: 'overlay', create: () => ({ el: document.createElement('div') }) });
  await ui.go('game');
  const wrapper = document.querySelector('.mp-screen[data-screen="game"]');
  assert.equal(wrapper.dataset.keys, 'passthrough'); assert.ok(wrapper.contains(hud));
  click(hud.buttons.pause); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ui.overlays, ['pause']);
  ui.destroy();
});

console.log(`\n${passed} passed, ${failed} failed`);
