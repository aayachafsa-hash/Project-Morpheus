// Tests for the Step 2 screen manager. Run: node tests/screens.test.mjs   (needs `npm i jsdom` once, same as smoke.test.mjs)
// No gameplay code, no real timers: transitions run on a fake clock injected through the `schedule` option.
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const k of ['window', 'document', 'KeyboardEvent', 'MouseEvent', 'Event', 'HTMLElement']) globalThis[k] = k === 'window' ? dom.window : dom.window[k];
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.removeEventListener = (...a) => dom.window.removeEventListener(...a);
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

const { createScreenManager, createHistory, h } = await import('../src/ui/index.js');

// ── Harness ───────────────────────────────────────────────────────────────
const queue = []; let passed = 0, failed = 0;
const test = (name, fn) => queue.push([name, fn]);
const group = name => queue.push([`\n${name}`, null]);

const L = [];                       // lifecycle log shared by the screens below
const managers = [];
function clock() {
  let now = 0; const timers = new Set();
  return {
    schedule: (fn, ms) => { const t = { fn, at: now + ms }; timers.add(t); return () => timers.delete(t); },
    tick(ms) { now += ms; for (const t of [...timers].filter(t => t.at <= now).sort((a, b) => a.at - b.at)) if (timers.delete(t)) t.fn(); },
    get pending() { return timers.size; },
  };
}
function make(opts = {}) {
  const c = clock(); const warnings = [];
  const ui = createScreenManager({ schedule: c.schedule, warn: (...a) => warnings.push(a), transitionMs: 0, ...opts });
  managers.push(ui);
  return { ui, c, warnings };
}
/** A generic screen definition that logs its lifecycle into L. */
const def = (id, over = {}) => ({
  id, to: '*',
  create(ctx) {
    L.push(`${id}:create:${ctx.presentation}`);
    ctx.onDestroy(() => L.push(`${id}:cleanup:${ctx.presentation}`));
    const el = h('div', { class: `s-${id}` }, h('button', { class: 'b1', type: 'button' }, id), h('button', { class: 'b2', type: 'button' }, 'two'));
    return { el, initialFocus: '.b1', enter: () => L.push(`${id}:enter`), leave: () => L.push(`${id}:leave`), destroy: () => L.push(`${id}:destroy`) };
  },
  ...over,
});
const overlay = (id, over = {}) => def(id, { presentation: 'overlay', ...over });
const reg = (ui, ...defs) => ui.register(defs.map(d => (typeof d === 'string' ? def(d) : d)));
const hist = ui => ui.history.map(e => e.id);
const wrappers = () => [...document.querySelectorAll('.mp-screen')];
const interactive = () => wrappers().filter(w => !w.hasAttribute('inert'));
const key = (k, init = {}, target = document.body) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); target.dispatchEvent(e); return e; };
const snap = ui => JSON.stringify({ c: ui.current, h: ui.history, o: ui.overlays, n: wrappers().length });
const w = id => document.querySelector(`.mp-screen[data-screen="${id}"]`);

// ═════════════════════════════════════════════════════════════════════════
group('Registration and validation');

test('invalid definitions throw TypeError with a readable message', () => {
  const { ui } = make();
  const ok = { id: 'a', to: '*', create: () => ({ el: h('div') }) };
  const bad = [null, { ...ok, id: 'Main Menu' }, { ...ok, id: undefined }, { ...ok, create: undefined }, { ...ok, to: undefined }, { ...ok, to: [1] },
    { ...ok, presentation: 'modal' }, { ...ok, keys: 'all' }, { ...ok, backdrop: 'purple' }, { ...ok, transitionMs: -5 }, { ...ok, title: 5 }, { ...ok, persistent: 'yes' },
    { ...ok, presentation: 'overlay', keys: 'passthrough' }, { ...ok, presentation: 'both', keys: 'passthrough' }];
  for (const d of bad) assert.throws(() => ui.register(d), TypeError, JSON.stringify(d));
  assert.throws(() => ui.register({ ...ok, to: undefined }), /`to` is required/);
});
test('duplicate ids are rejected; valid definitions register (single or array)', () => {
  const { ui } = make();
  ui.register(def('a')); assert.throws(() => ui.register(def('a')), /already registered/);
  ui.register([def('b'), def('c')]); assert.ok(ui.has('a') && ui.has('b') && ui.has('c'));
});
test('validate() lists destinations that were never registered; wildcard is fine', () => {
  const { ui } = make();
  reg(ui, def('a', { to: ['b', 'ghost'] }), def('b', { to: '*' }));
  assert.deepEqual(ui.validate(), [{ from: 'a', to: 'ghost', issue: 'unregistered-destination' }]);
});
test('manager builds one stage with layers, a live region and does not hard-code any screens', () => {
  const { ui } = make();
  assert.equal(document.querySelectorAll('[data-mp-stage]').length, 1);
  assert.ok(ui.stage.querySelector('.mp-stage__screens') && ui.stage.querySelector('.mp-stage__overlays'));
  assert.equal(ui.stage.querySelector('[aria-live="polite"]').getAttribute('role'), 'status');
  assert.equal(ui.current, null); assert.equal(ui.canGoBack, false); assert.deepEqual(ui.validate(), []);
});

// ═════════════════════════════════════════════════════════════════════════
group('Navigation and invalid destinations');

test('go() mounts exactly one active screen and updates state', async () => {
  const { ui } = make(); reg(ui, 'a', 'b');
  const r = await ui.go('a', { n: 1 });
  assert.deepEqual(r, { ok: true }); assert.deepEqual(ui.current, { id: 'a', params: { n: 1 } });
  assert.equal(wrappers().length, 1); assert.equal(w('a').dataset.state, 'active');
  await ui.go('b'); assert.equal(wrappers().length, 1); assert.ok(w('b') && !w('a'));
});
test('unregistered, not-allowed, wrong-presentation and same-screen are rejected without changing anything', async () => {
  const { ui, warnings } = make();
  reg(ui, def('a', { to: ['a', 'b'] }), def('b', { to: [] }), def('c'), overlay('o', { to: [] }));
  await ui.go('a'); const before = snap(ui);
  assert.deepEqual(await ui.go('ghost'), { ok: false, reason: 'not-registered', id: 'ghost' });
  assert.equal((await ui.go('c')).reason, 'not-allowed');
  assert.equal((await ui.go('o')).reason, 'wrong-presentation');
  assert.equal((await ui.go('a')).reason, 'same-screen');
  assert.equal((await ui.open('b')).reason, 'wrong-presentation');
  assert.equal(snap(ui), before); assert.equal(warnings.length, 5);
});
test("'to' of the screen being left decides; '*' allows everything", async () => {
  const { ui } = make(); reg(ui, def('a', { to: ['b'] }), 'b', 'c');
  await ui.go('a'); assert.equal((await ui.go('c')).ok, false);
  assert.equal((await ui.go('b')).ok, true); assert.equal((await ui.go('c')).ok, true); // b has '*'
});
test('the first go() is always allowed (nothing to validate against)', async () => {
  const { ui } = make(); reg(ui, def('a', { to: [] })); assert.equal((await ui.go('a')).ok, true);
});
test('back() is never validated against `to`', async () => {
  const { ui } = make(); reg(ui, def('a', { to: ['b'] }), def('b', { to: [] }));
  await ui.go('a'); await ui.go('b'); assert.equal((await ui.back()).ok, true); assert.equal(ui.current.id, 'a');
});
test('back() on empty history is rejected; back restores the saved params', async () => {
  const { ui } = make(); reg(ui, 'a', 'b');
  await ui.go('a', { n: 1 }); assert.equal((await ui.back()).reason, 'empty-history');
  await ui.go('b'); await ui.back(); assert.deepEqual(ui.current, { id: 'a', params: { n: 1 } });
});

// ═════════════════════════════════════════════════════════════════════════
group('History: replace / history:false / reset');

test('default: the screen being left is pushed', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c');
  await ui.go('a'); await ui.go('b'); await ui.go('c'); assert.deepEqual(hist(ui), ['a', 'b']);
  await ui.back(); assert.equal(ui.current.id, 'b'); assert.deepEqual(hist(ui), ['a']);
  await ui.back(); assert.equal(ui.current.id, 'a'); assert.equal(ui.canGoBack, false);
});
test('replace: the screen being left is not pushed', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c');
  await ui.go('a'); await ui.go('b'); await ui.go('c', {}, { replace: true });
  assert.deepEqual(hist(ui), ['a']); assert.equal(ui.current.id, 'c');
});
test('reset: stack emptied first, the screen being left is not pushed', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c');
  await ui.go('a'); await ui.go('b'); await ui.go('c', {}, { reset: true });
  assert.deepEqual(hist(ui), []); assert.equal(ui.canGoBack, false);
});
test('definition history:false: that screen is never a back target', async () => {
  const { ui } = make(); reg(ui, 'a', def('x', { history: false }), 'b');
  await ui.go('a'); await ui.go('x'); await ui.go('b'); assert.deepEqual(hist(ui), ['a']);
  await ui.back(); assert.equal(ui.current.id, 'a');
});
test('call history:false applies to that visit; call history:true overrides a false definition', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c', def('x', { history: false }));
  await ui.go('a'); await ui.go('b', {}, { history: false }); await ui.go('c'); assert.deepEqual(hist(ui), ['a']);
  const m = make(); reg(m.ui, 'a', 'b', def('x', { history: false }));
  await m.ui.go('a'); await m.ui.go('x', {}, { history: true }); await m.ui.go('b'); assert.deepEqual(hist(m.ui), ['a', 'x']);
});
test('reset + history:false: stack empty and the destination stays unrecorded', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c', 'd');
  await ui.go('a'); await ui.go('b'); await ui.go('c', {}, { reset: true, history: false });
  assert.deepEqual(hist(ui), []); await ui.go('d'); assert.deepEqual(hist(ui), []);
});
test('replace + history:false: neither side is recorded', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', 'c', 'd');
  await ui.go('a'); await ui.go('b'); await ui.go('c', {}, { replace: true, history: false }); await ui.go('d');
  assert.deepEqual(hist(ui), ['a']);
});
test('next level / retry never lets Back return to a completed puzzle', async () => {
  const { ui } = make();
  reg(ui, 'menu', 'levels', def('game', { history: false }), def('done', { history: false }));
  await ui.go('menu'); await ui.go('levels'); await ui.go('game', { level: 7 });
  await ui.go('done'); await ui.go('game', { level: 8 });            // next level
  assert.deepEqual(hist(ui), ['menu', 'levels']); assert.equal(ui.current.params.level, 8);
  await ui.go('done'); await ui.go('game', { level: 8 });            // retry
  assert.deepEqual(hist(ui), ['menu', 'levels']);
  await ui.back(); assert.equal(ui.current.id, 'levels');
});
test('back never lands on the screen it is already on (duplicate entries are skipped)', async () => {
  const { ui } = make(); reg(ui, 'a', 'b');
  await ui.go('a'); await ui.go('b'); await ui.go('a', {}, { replace: true }); // history [a], current a
  assert.equal((await ui.back()).reason, 'empty-history'); assert.equal(ui.current.id, 'a');
});
test('history module: pure rules', () => {
  const hs = createHistory();
  hs.navigate({ id: 'a', record: true }); hs.navigate({ id: 'b', record: false }); hs.navigate({ id: 'c', record: true });
  assert.deepEqual(hs.snapshot().map(e => e.id), ['a']); assert.equal(hs.back().id, 'a'); assert.equal(hs.back(), null);
});

// ═════════════════════════════════════════════════════════════════════════
group('Overlays');

test('open() stacks overlays; only the topmost layer is interactive; close() reverses', async () => {
  const { ui } = make(); reg(ui, def('s', { to: ['o1', 'o2'] }), overlay('o1', { to: ['o2'] }), overlay('o2'));
  await ui.go('s'); await ui.open('o1');
  assert.deepEqual(ui.overlays, ['o1']); assert.ok(w('s').hasAttribute('inert') && w('s').getAttribute('aria-hidden') === 'true');
  assert.ok(ui.stage.querySelector('.mp-stage__overlays [data-screen="o1"]'));
  await ui.open('o2'); assert.deepEqual(ui.overlays, ['o1', 'o2']);
  assert.deepEqual(interactive().map(x => x.dataset.screen), ['o2']);
  await ui.close(); assert.deepEqual(interactive().map(x => x.dataset.screen), ['o1']);
  await ui.back();                       // back() closes overlays before touching history
  assert.deepEqual(ui.overlays, []); assert.deepEqual(interactive().map(x => x.dataset.screen), ['s']); assert.ok(!w('s').hasAttribute('aria-hidden'));
});
test('open() is validated against the topmost layer; rejections change nothing', async () => {
  const { ui } = make(); reg(ui, def('s', { to: ['o1'] }), overlay('o1', { to: ['o1', 'o2'] }), overlay('o2', { to: [] }));
  assert.equal((await ui.open('o1')).reason, 'no-screen');
  await ui.go('s'); assert.equal((await ui.open('o2')).reason, 'not-allowed');
  await ui.open('o1'); assert.equal((await ui.open('o1')).reason, 'already-open');
  assert.equal((await ui.open('o2')).ok, true); assert.equal((await ui.close()).ok, true); assert.equal((await ui.close()).ok, true);
  assert.equal((await ui.close()).reason, 'no-overlay');
});
test('go() closes all overlays with leave/destroy order top-first', async () => {
  const { ui } = make(); reg(ui, def('s'), overlay('o1'), overlay('o2'), 'home');
  await ui.go('s'); await ui.open('o1'); await ui.open('o2'); L.length = 0;
  assert.equal((await ui.go('home')).ok, true);
  assert.deepEqual(ui.overlays, []); assert.equal(ui.stage.querySelector('.mp-stage__overlays').children.length, 0);
  assert.deepEqual(L.filter(x => /leave|destroy/.test(x)), ['o2:leave', 'o1:leave', 's:leave', 'o2:destroy', 'o1:destroy', 's:destroy']);
});
test('go() from an overlay uses the overlay\'s own `to`', async () => {
  const { ui } = make(); reg(ui, def('s'), overlay('p', { to: ['home'] }), 'home', 'other');
  await ui.go('s'); await ui.open('p');
  assert.equal((await ui.go('other')).reason, 'not-allowed'); assert.deepEqual(ui.overlays, ['p']);
  assert.equal((await ui.go('home')).ok, true);
});
test("one definition, two presentations: separate instances, each cleaned up on its own", async () => {
  const { ui } = make(); reg(ui, 'home', def('settings', { presentation: 'both' }));
  await ui.go('home'); await ui.go('settings');                 // as a screen
  assert.equal(document.querySelectorAll('.mp-screen[data-screen="settings"]').length, 1);
  const screenEl = document.querySelector('.s-settings');
  assert.equal((await ui.open('settings')).reason, 'already-open');   // never both at once
  await ui.back();                                                    // leave the screen presentation
  assert.equal(document.querySelectorAll('.s-settings').length, 0);
  await ui.open('settings');                                          // as an overlay
  const overlayEl = document.querySelector('.s-settings');
  assert.notEqual(screenEl, overlayEl); assert.equal(document.querySelectorAll('.mp-screen[data-screen="settings"]').length, 1);
  assert.ok(overlayEl.closest('.mp-stage__overlays')); await ui.close();
  assert.deepEqual(L.filter(x => x.startsWith('settings:')), [
    'settings:create:screen', 'settings:enter', 'settings:leave', 'settings:destroy', 'settings:cleanup:screen',
    'settings:create:overlay', 'settings:enter', 'settings:leave', 'settings:destroy', 'settings:cleanup:overlay']);
});

test("a persistent 'both' definition keeps one retained instance per presentation, never shared", async () => {
  const { ui } = make(); const made = [];
  reg(ui, 'home', def('settings', { presentation: 'both', persistent: true, create: ctx => { made.push(ctx.presentation); return { el: h('div', { class: `s-settings ${ctx.presentation}` }, h('button', {}, 'b')) }; } }));
  await ui.go('home'); await ui.go('settings'); const screenEl = document.querySelector('.s-settings'); await ui.back();
  await ui.open('settings'); const overlayEl = document.querySelector('.s-settings'); await ui.close();
  assert.deepEqual(made, ['screen', 'overlay']); assert.notEqual(screenEl, overlayEl); assert.ok(screenEl.classList.contains('screen') && overlayEl.classList.contains('overlay'));
  await ui.go('settings'); await ui.back(); await ui.open('settings'); await ui.close();     // revisit both: nothing is created again
  assert.deepEqual(made, ['screen', 'overlay']); assert.equal(document.querySelectorAll('.s-settings').length, 0);
});

// ═════════════════════════════════════════════════════════════════════════
group('Lifecycle');

test('non-persistent order: incoming create → outgoing leave → incoming enter → outgoing destroy', async () => {
  const { ui } = make(); reg(ui, 'a', 'b');
  await ui.go('a'); L.length = 0; await ui.go('b');
  assert.deepEqual(L, ['b:create:screen', 'a:leave', 'b:enter', 'a:destroy', 'a:cleanup:screen']);
});
test('the same order holds with a real transition (destroy is deferred to its end)', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 'a', 'b');
  const p = ui.go('a'); c.tick(750); await p; L.length = 0;
  const q = ui.go('b'); assert.deepEqual(L, ['b:create:screen', 'a:leave', 'b:enter']);
  c.tick(750); await q; assert.deepEqual(L.slice(3), ['a:destroy', 'a:cleanup:screen']);
});
test('enter/leave receive info; non-persistent screens are created fresh on every visit', async () => {
  const { ui } = make(); const seen = []; let aCreates = 0;
  reg(ui, def('a', { create: () => (aCreates++, { el: h('div'), enter: (p, i) => seen.push(['enter', p, i]), leave: i => seen.push(['leave', i]) }) }), 'b');
  await ui.go('a', { n: 1 }); await ui.go('b');
  assert.deepEqual(seen[0], ['enter', { n: 1 }, { from: null, reason: 'go', presentation: 'screen' }]); assert.deepEqual(seen[1], ['leave', { to: 'b', reason: 'go' }]);
  await ui.back(); assert.equal(seen[2][2].reason, 'back');
  await ui.go('b'); await ui.back();
  assert.equal(L.filter(x => x === 'b:create:screen').length, 2); assert.equal(aCreates, 3); // every visit creates a fresh instance
});
test('ctx.listen / ctx.onDestroy are undone when a non-persistent screen is destroyed', async () => {
  const { ui } = make(); let n = 0;
  reg(ui, def('a', { create: ctx => { ctx.listen(window, 'keydown', () => n++); return { el: h('div') }; } }), 'b');
  await ui.go('a'); key('x'); assert.equal(n, 1);
  await ui.go('b'); key('x'); assert.equal(n, 1);
});
test('persistent: create once; enter/leave every visit with fresh params; destroy only on ui.destroy()', async () => {
  const { ui } = make(); const params = [];
  reg(ui, def('p', { persistent: true, create: ctx => { L.push('p:create'); return { el: h('div', { class: 's-p' }), enter: p => params.push(p.n), leave: () => L.push('p:leave'), destroy: () => L.push('p:destroy') }; } }), 'x');
  for (let n = 1; n <= 3; n++) { await ui.go('p', { n }); await ui.go('x'); }
  assert.equal(L.filter(x => x === 'p:create').length, 1); assert.deepEqual(params, [1, 2, 3]);
  assert.equal(L.filter(x => x === 'p:leave').length, 3); assert.equal(L.includes('p:destroy'), false);
  ui.destroy(); assert.equal(L.filter(x => x === 'p:destroy').length, 1);
});
test('persistent revisits never duplicate DOM, keep element identity and state, and do not stack listeners', async () => {
  const { ui } = make(); let clicks = 0, keys = 0, input;
  reg(ui, def('p', { persistent: true, create: ctx => {
    input = h('input', { type: 'text' }); const b = h('button', { type: 'button', class: 'hit' }, 'hit');
    ctx.listen(b, 'click', () => clicks++); ctx.listen(window, 'keydown', () => keys++);
    return { el: h('div', { class: 's-p' }, input, b) }; } }), 'x');
  await ui.go('p'); const el = document.querySelector('.s-p'); input.value = 'kept';
  for (let i = 0; i < 4; i++) { await ui.go('x'); assert.equal(document.querySelectorAll('.s-p').length, 0); await ui.go('p'); }
  assert.equal(document.querySelectorAll('.s-p').length, 1); assert.equal(document.querySelector('.s-p'), el); assert.equal(input.value, 'kept');
  assert.equal(wrappers().filter(x => x.dataset.screen === 'p').length, 1);
  document.querySelector('.hit').click(); key('a'); assert.equal(clicks, 1); assert.equal(keys, 1);
});
test('create() throwing, or returning no element, is create-failed and changes nothing', async () => {
  const { ui, warnings } = make();
  reg(ui, 'a', def('boom', { create() { throw new Error('nope'); } }), def('empty', { create: () => ({}) }));
  await ui.go('a'); const before = snap(ui);
  assert.equal((await ui.go('boom')).reason, 'create-failed'); assert.equal((await ui.go('empty')).reason, 'create-failed');
  assert.equal(snap(ui), before); assert.ok(warnings.length >= 2);
});
test('errors thrown by enter/leave/destroy/onKey are contained', async () => {
  const { ui, warnings } = make();
  const thrower = id => def(id, { to: '*', create: () => ({ el: h('div'), enter() { throw new Error('e'); }, leave() { throw new Error('l'); }, destroy() { throw new Error('d'); }, onKey() { throw new Error('k'); } }) });
  reg(ui, thrower('a'), thrower('b'));
  await ui.go('a'); await ui.go('b'); key('x'); assert.equal(ui.current.id, 'b'); assert.equal(wrappers().length, 1); assert.ok(warnings.length >= 4);
});

// ═════════════════════════════════════════════════════════════════════════
group('Keyboard routing');

test('Escape closes the topmost overlay, one per press, and prevents default', async () => {
  const { ui } = make(); reg(ui, 's', overlay('o1'), overlay('o2'));
  await ui.go('s'); await ui.open('o1'); await ui.open('o2');
  assert.equal(key('Escape').defaultPrevented, true); assert.deepEqual(ui.overlays, ['o1']);
  key('Escape'); assert.deepEqual(ui.overlays, []); assert.equal(ui.current.id, 's');
});
test('Escape on a screen goes back when there is history; otherwise it is left alone', async () => {
  const { ui } = make(); reg(ui, 'a', 'b');
  await ui.go('a'); assert.equal(key('Escape').defaultPrevented, false); assert.equal(ui.current.id, 'a');
  await ui.go('b'); assert.equal(key('Escape').defaultPrevented, true); assert.equal(ui.current.id, 'a');
});
test('escape:false disables the default on screens and overlays', async () => {
  const { ui } = make(); reg(ui, 'a', def('b', { escape: false }), overlay('o', { escape: false }));
  await ui.go('a'); await ui.go('b'); key('Escape'); assert.equal(ui.current.id, 'b');
  await ui.open('o'); key('Escape'); assert.deepEqual(ui.overlays, ['o']);
});
test('onKey handling beats the defaults; an unhandled key falls through to them', async () => {
  const { ui } = make(); const seen = [];
  reg(ui, 'a', def('b', { create: () => ({ el: h('div'), onKey: (e, api) => { seen.push([e.key, api === ui]); return e.key === 'Escape'; } }) }));
  await ui.go('a'); await ui.go('b');
  key('Escape'); assert.equal(ui.current.id, 'b'); key('q'); assert.deepEqual(seen, [['Escape', true], ['q', true]]);
});
test('an overlay is modal: keys it does not handle never reach the screen below', async () => {
  const { ui } = make(); const below = [], top = [];
  reg(ui, def('s', { create: () => ({ el: h('div'), onKey: e => { below.push(e.key); } }) }), def('o', { presentation: 'overlay', create: () => ({ el: h('div'), onKey: e => { top.push(e.key); } }) }));
  await ui.go('s'); key('a'); await ui.open('o'); key('b'); key('c');
  assert.deepEqual(below, ['a']); assert.deepEqual(top, ['b', 'c']);
});
test("keys:'passthrough' on the topmost screen: the manager does nothing at all and never blocks propagation", async () => {
  const { ui } = make(); const calls = []; const gameplay = [];
  reg(ui, 'menu', def('game', { keys: 'passthrough', create: () => ({ el: h('div'), onKey: e => { calls.push(e.key); return true; } }) }));
  await ui.go('menu'); await ui.go('game');
  window.addEventListener('keydown', e => gameplay.push([e.key, e.defaultPrevented, e.cancelBubble]));
  for (const k of ['Escape', 'Tab', 'r', 'Z', '1']) assert.equal(key(k).defaultPrevented, false);
  assert.deepEqual(calls, []); assert.equal(ui.current.id, 'game'); assert.equal(hist(ui).length, 1);
  assert.deepEqual(gameplay.map(g => g[0]), ['Escape', 'Tab', 'r', 'Z', '1']); assert.ok(gameplay.every(g => g[1] === false && g[2] === false));
});
test('passthrough stops mattering when an overlay is on top: the overlay gets Escape and the Tab trap', async () => {
  const { ui } = make(); reg(ui, def('game', { keys: 'passthrough', to: ['pause'] }), overlay('pause'));
  await ui.go('game'); await ui.open('pause'); key('Escape'); assert.deepEqual(ui.overlays, []); assert.equal(ui.current.id, 'game');
  assert.equal(key('Escape').defaultPrevented, false);
});
test('modified, composing or already-handled key events are ignored', async () => {
  const { ui } = make(); reg(ui, 's', overlay('o'));
  await ui.go('s'); await ui.open('o');
  key('Escape', { ctrlKey: true }); key('Escape', { metaKey: true }); key('Escape', { altKey: true }); key('Escape', { isComposing: true });
  const pre = e => e.preventDefault(); document.body.addEventListener('keydown', pre); key('Escape'); document.body.removeEventListener('keydown', pre);
  assert.deepEqual(ui.overlays, ['o']); key('Escape'); assert.deepEqual(ui.overlays, []);
});
test('Tab is trapped inside an overlay (wraps both ways, leaves the middle alone)', async () => {
  const { ui } = make(); reg(ui, 's', def('o', { presentation: 'overlay', create: () => ({ el: h('div', {}, h('button', { class: 'f' }, 'f'), h('button', { class: 'm' }, 'm'), h('button', { class: 'l' }, 'l')), initialFocus: '.f' }) }));
  await ui.go('s'); await ui.open('o'); const q = s => document.querySelector(`.mp-stage__overlays ${s}`);
  q('.l').focus(); assert.equal(key('Tab').defaultPrevented, true); assert.equal(document.activeElement, q('.f'));
  assert.equal(key('Tab', { shiftKey: true }).defaultPrevented, true); assert.equal(document.activeElement, q('.l'));
  q('.m').focus(); assert.equal(key('Tab').defaultPrevented, false);
});

// ═════════════════════════════════════════════════════════════════════════
group('Focus management');

test('initialFocus: selector, function, element; falls back to the first tabbable, then to the wrapper', async () => {
  const { ui } = make(); const ids = {};
  const mk = (id, spec) => def(id, { create: () => { const el = h('div', {}, h('button', { class: 'one' }, '1'), h('button', { class: 'two' }, '2')); return { el, initialFocus: spec(el) }; } });
  reg(ui, mk('a', () => '.two'), mk('b', el => () => el.querySelector('.two')), mk('c', el => el.querySelector('.two')), mk('d', () => '.missing'),
    def('e', { create: () => ({ el: h('p', {}, 'no controls') }) }));
  await ui.go('a'); assert.equal(document.activeElement.className, 'two');
  await ui.go('b'); assert.equal(document.activeElement.className, 'two');
  await ui.go('c'); assert.equal(document.activeElement.className, 'two');
  await ui.go('d'); assert.equal(document.activeElement.className, 'one');
  await ui.go('e'); assert.equal(document.activeElement, w('e'));
});
test('passthrough screens leave focus alone unless they ask for a target', async () => {
  const { ui } = make(); reg(ui, 'a', def('game', { keys: 'passthrough', create: () => ({ el: h('div', {}, h('button', {}, 'hud')) }) }), def('asks', { keys: 'passthrough' }));
  const outside = h('input', { id: 'outside' }); document.body.append(outside);
  await ui.go('a'); outside.focus(); await ui.go('game'); assert.equal(document.activeElement, outside);
  await ui.go('asks'); assert.equal(document.activeElement.className, 'b1');   // explicit initialFocus is honoured
});
test('closing an overlay restores focus to the opener', async () => {
  const { ui } = make(); reg(ui, 's', overlay('o'));
  await ui.go('s'); const b2 = document.querySelector('.s-s .b2'); b2.focus();
  await ui.open('o'); assert.ok(document.activeElement.closest('[data-screen="o"]'));
  await ui.close(); assert.equal(document.activeElement, b2);
});
test('nested overlays restore focus level by level', async () => {
  const { ui } = make(); reg(ui, 's', overlay('o1'), overlay('o2'));
  await ui.go('s'); const sb2 = document.querySelector('.s-s .b2'); sb2.focus();
  await ui.open('o1'); const o1b2 = document.querySelector('.s-o1 .b2'); o1b2.focus();
  await ui.open('o2'); await ui.close(); assert.equal(document.activeElement, o1b2);
  await ui.close(); assert.equal(document.activeElement, sb2);
});
test('if the opener is gone, focus falls back to the screen underneath', async () => {
  const { ui } = make(); reg(ui, 's', overlay('o'));
  await ui.go('s'); const b2 = document.querySelector('.s-s .b2'); b2.focus(); await ui.open('o'); b2.remove();
  await ui.close(); assert.equal(document.activeElement, document.querySelector('.s-s .b1'));
});
test('declarative data-open uses the clicked element as opener even when clicking does not focus it', async () => {
  const { ui } = make();
  reg(ui, def('s', { create: () => { const b = h('button', { 'data-open': 'o', class: 'opener' }, 'open'); return { el: h('div', {}, h('button', { class: 'first' }, 'x'), b), initialFocus: '.first' }; } }), overlay('o'));
  await ui.go('s'); document.querySelector('.opener').click(); assert.deepEqual(ui.overlays, ['o']);
  await ui.close(); assert.equal(document.activeElement.className, 'opener');
});
test('persistent screens get their last focused control back on revisit', async () => {
  const { ui } = make(); reg(ui, def('p', { persistent: true }), 'x');
  await ui.go('p'); const b2 = document.querySelector('.s-p .b2'); b2.focus();
  await ui.go('x'); await ui.go('p'); assert.equal(document.activeElement, b2);
});

// ═════════════════════════════════════════════════════════════════════════
group('Transitions: timing, interruption, cleanup');

test('a transition marks entering/leaving, then settles on a timer', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 'a', 'b');
  const p = ui.go('a'); assert.equal(w('a').dataset.state, 'entering'); assert.equal(ui.transitioning, true);
  c.tick(749); assert.equal(w('a').dataset.state, 'entering'); c.tick(1); assert.deepEqual(await p, { ok: true });
  assert.equal(w('a').dataset.state, 'active'); assert.equal(ui.transitioning, false);
  const q = ui.go('b');
  assert.equal(w('a').dataset.state, 'leaving'); assert.ok(w('a').hasAttribute('inert')); assert.equal(interactive().length, 1);
  assert.equal(wrappers().length, 2); c.tick(750); await q; assert.equal(wrappers().length, 1); assert.ok(L.includes('a:destroy'));
});
test('interruption: the running transition is finished instantly, the new request runs, one screen stays interactive', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 'a', 'b', 'c');
  const pa = ui.go('a'); c.tick(750); await pa;
  const pb = ui.go('b'); L.length = 0;
  const pc = ui.go('c');
  assert.deepEqual(await pb, { ok: true, interrupted: true });
  assert.ok(L.indexOf('a:destroy') !== -1 && L.indexOf('a:destroy') < L.indexOf('c:create:screen')); // a was finalized before c started
  assert.equal(interactive().length, 1); assert.equal(interactive()[0].dataset.screen, 'c');
  assert.deepEqual(wrappers().map(x => `${x.dataset.screen}:${x.dataset.state}`).sort(), ['b:leaving', 'c:entering']);
  c.tick(750); assert.deepEqual(await pc, { ok: true });
  assert.deepEqual(wrappers().map(x => x.dataset.screen), ['c']); assert.equal(c.pending, 0); assert.equal(ui.current.id, 'c');
  assert.ok(L.includes('b:destroy'));
});
test('rapid navigation never leaves two interactive screens, a stray wrapper, a leaked instance or a timer', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 'a', 'b', 'c');
  const order = ['a', 'b', 'c', 'a', 'c', 'b', 'a', 'b']; const ps = [];
  for (const id of order) { ps.push(ui.go(id)); assert.equal(interactive().length, 1); assert.equal(interactive()[0].dataset.screen, id); assert.ok(wrappers().length <= 2); c.tick(100); }
  c.tick(2000); const results = await Promise.all(ps);
  assert.ok(results.every(r => r.ok)); assert.equal(results.filter(r => r.interrupted).length, order.length - 1);
  assert.equal(wrappers().length, 1); assert.equal(c.pending, 0); assert.equal(ui.transitioning, false);
  const created = L.filter(x => x.includes(':create:')).length, destroyed = L.filter(x => x.endsWith(':destroy')).length;
  assert.equal(created, destroyed + 1);  // everything but the live screen was destroyed
});
test('interrupting an overlay opening with a close (and with a go) cleans up completely', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 's', overlay('o'), 'n');
  const p = ui.go('s'); c.tick(750); await p;
  ui.open('o'); ui.close(); assert.equal(interactive().length, 1); c.tick(750);
  assert.equal(ui.stage.querySelector('.mp-stage__overlays').children.length, 0); assert.equal(L.filter(x => x === 'o:destroy').length, 1);
  ui.open('o'); ui.go('n'); c.tick(750);
  assert.deepEqual(ui.overlays, []); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['n']); assert.equal(L.filter(x => x === 'o:destroy').length, 2); assert.equal(c.pending, 0);
});
test('interrupting a persistent screen mid-transition mounts it exactly once', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, def('p', { persistent: true }), 'x');
  const p0 = ui.go('p'); c.tick(750); await p0;
  ui.go('x'); ui.go('p'); ui.go('x'); ui.go('p'); c.tick(750);
  assert.equal(document.querySelectorAll('.s-p').length, 1); assert.equal(L.filter(x => x === 'p:create:screen').length, 1);
  assert.deepEqual(wrappers().map(x => x.dataset.screen), ['p']); assert.equal(c.pending, 0);
});
test('a rejected request does not interrupt the running transition', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, def('a', { to: ['b'] }), 'b', 'c');
  const p = ui.go('a'); await ui.go('c'); assert.equal(ui.transitioning, true); c.tick(750); assert.deepEqual(await p, { ok: true });
});

// ═════════════════════════════════════════════════════════════════════════
group('Reduced motion and configurable duration');

test('reduced motion: navigation completes synchronously, with no timer and no animated state', async () => {
  let rm = true; const { ui, c } = make({ transitionMs: 750, reducedMotion: () => rm }); reg(ui, def('a', { transitionMs: 900 }), 'b');
  ui.go('a', {}, { transitionMs: 900 }); assert.equal(ui.transitioning, false); assert.equal(c.pending, 0);
  assert.equal(w('a').dataset.state, 'active'); assert.equal(ui.stage.style.getPropertyValue('--mp-screen-ms'), '0ms');
  ui.go('b'); assert.equal(wrappers().length, 1); assert.ok(L.includes('a:destroy')); assert.equal(w('b').dataset.state, 'active');
  ui.open; rm = false; const p = ui.go('a'); assert.equal(w('a').dataset.state, 'entering'); c.tick(900); await p;
});
test('reduced motion also applies to overlays and back', async () => {
  const { ui, c } = make({ transitionMs: 750, reducedMotion: () => true }); reg(ui, 's', overlay('o'), 't');
  ui.go('s'); ui.open('o'); assert.equal(wrappers().every(x => x.dataset.state === 'active'), true);
  ui.close(); assert.equal(ui.stage.querySelector('.mp-stage__overlays').children.length, 0);
  ui.go('t'); ui.back(); assert.equal(c.pending, 0); assert.equal(ui.current.id, 's'); assert.equal(wrappers().length, 1);
});
test('duration precedence: call option > definition > manager default; 0 means instant', async () => {
  const { ui, c } = make({ transitionMs: 100 }); const ms = () => ui.stage.style.getPropertyValue('--mp-screen-ms');
  reg(ui, 'plain', def('slow', { transitionMs: 200 }), def('instant', { transitionMs: 0 }));
  ui.go('plain'); assert.equal(ms(), '100ms'); c.tick(100);
  ui.go('slow'); assert.equal(ms(), '200ms'); c.tick(200);
  ui.go('plain', {}, { transitionMs: 300 }); assert.equal(ms(), '300ms'); c.tick(300);
  ui.go('instant'); assert.equal(ms(), '0ms'); assert.equal(ui.transitioning, false); assert.equal(wrappers().length, 1);
});

// ═════════════════════════════════════════════════════════════════════════
group('Shared backdrop');

test('exactly one backdrop and one set of SVG ids, however many navigations and overlays', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', overlay('o'));
  for (let i = 0; i < 4; i++) { await ui.go('a'); await ui.open('o'); await ui.close(); await ui.go('b'); }
  assert.equal(document.querySelectorAll('.mp-backdrop').length, 1); assert.equal(document.querySelectorAll('#mp-shaft').length, 1); assert.equal(document.querySelectorAll('#mp-soft').length, 1);
  assert.ok(ui.backdrop === document.querySelector('.mp-backdrop'));
});
test('backdrop variant follows the screen; false hides it; overlays leave it alone', async () => {
  const { ui } = make(); reg(ui, def('warm'), def('lost', { backdrop: 'fail' }), def('game', { backdrop: false }), overlay('o'));
  await ui.go('warm'); assert.equal(ui.backdrop.dataset.variant, 'warm');
  await ui.go('lost'); assert.equal(ui.backdrop.dataset.variant, 'fail');
  await ui.open('o'); assert.equal(ui.backdrop.dataset.variant, 'fail'); await ui.close();
  await ui.go('game'); assert.equal(ui.backdrop.style.display, 'none');
  await ui.go('warm'); assert.equal(ui.backdrop.style.display, ''); assert.equal(ui.backdrop.dataset.variant, 'warm');
});
test('backdrop:false builds none; destroy() removes the shared one', () => {
  const none = make({ backdrop: false }); assert.equal(none.ui.backdrop, null); assert.equal(document.querySelectorAll('.mp-backdrop').length, 0);
  none.ui.destroy(); const { ui } = make(); assert.equal(document.querySelectorAll('.mp-backdrop').length, 1); ui.destroy(); assert.equal(document.querySelectorAll('.mp-backdrop').length, 0);
});

// ═════════════════════════════════════════════════════════════════════════
group('Declarative navigation, announcements, subscriptions, destroy');

const nav = (id, attrs, extra = {}) => def(id, { create: () => ({ el: h('div', {}, ...Object.entries(attrs).map(([name, a]) => h('button', { class: name, type: 'button', ...a }, name))) }), ...extra });
test('data-go / data-params / flags / data-back / data-close work', async () => {
  const { ui } = make();
  reg(ui, nav('a', { go: { 'data-go': 'b', 'data-params': '{"level":7}' }, rep: { 'data-go': 'c', 'data-replace': '' }, rst: { 'data-go': 'c', 'data-reset': '' }, nh: { 'data-go': 'c', 'data-no-history': '' } }), 'b', 'c');
  await ui.go('a'); const click = cls => document.querySelector(`.mp-screen[data-state="active"] .${cls}`).click();
  click('go'); assert.deepEqual(ui.current, { id: 'b', params: { level: 7 } }); assert.deepEqual(hist(ui), ['a']);
  await ui.back(); click('rep'); assert.deepEqual(hist(ui), []);
  const m = make(); reg(m.ui, nav('a', { rst: { 'data-go': 'c', 'data-reset': '' }, nh: { 'data-go': 'c', 'data-no-history': '' } }), 'c', nav('z', { back: { 'data-back': '' } }));
  await m.ui.go('a'); document.querySelector('.rst').click(); assert.equal(m.ui.current.id, 'c'); assert.equal(m.ui.canGoBack, false);
});
test('data-back and data-close, and data-no-history', async () => {
  const { ui } = make(); reg(ui, nav('a', { nh: { 'data-go': 'b', 'data-no-history': '' } }), nav('b', { back: { 'data-back': '' }, op: { 'data-open': 'o' } }), nav('o', { close: { 'data-close': '' } }, { presentation: 'overlay' }), 'c');
  await ui.go('a'); document.querySelector('.nh').click(); assert.deepEqual(hist(ui), ['a']);   // 'a' was recorded; b is the unrecorded one
  document.querySelector('.op').click(); assert.deepEqual(ui.overlays, ['o']); document.querySelector('.close').click(); assert.deepEqual(ui.overlays, []);
  document.querySelector('.back').click(); assert.equal(ui.current.id, 'a');
});
test('aria-disabled, inert (lower layer), leaving wrappers and elements outside the stage are ignored; bad params warn', async () => {
  const { ui, c, warnings } = make({ transitionMs: 750 });
  reg(ui, nav('a', { off: { 'data-go': 'b', 'aria-disabled': 'true' }, bad: { 'data-go': 'b', 'data-params': '{nope' } }, { to: '*' }), 'b', overlay('o'));
  const p = ui.go('a'); c.tick(750); await p;
  document.querySelector('.off').click(); assert.equal(ui.current.id, 'a');
  const out = h('button', { 'data-go': 'b' }); document.body.append(out); out.click(); assert.equal(ui.current.id, 'a');
  const o = ui.open('o'); c.tick(750); await o; document.querySelector('.s-a .bad, .bad')?.click(); assert.equal(ui.current.id, 'a'); // lower layer is inert
  const cl = ui.close(); c.tick(750); await cl;
  const leavingBtn = document.querySelector('.bad'); document.querySelector('.bad').click(); // active: navigates with {} params
  assert.equal(ui.current.id, 'b'); assert.deepEqual(ui.current.params, {}); assert.ok(warnings.some(x => String(x[0]).includes('data-params')));
  leavingBtn.click(); assert.equal(ui.current.id, 'b');                                     // its wrapper is leaving now: ignored
  c.tick(750);
});
test('titles are announced in a polite live region (string, function, repeated, overlay)', async () => {
  const { ui } = make(); const say = () => ui.stage.querySelector('[aria-live]').textContent.trim();
  reg(ui, def('a', { title: 'Main menu' }), def('b', { title: p => `Level ${p.n}` }), def('c', { title: () => { throw new Error('x'); } }), def('d'), def('o', { presentation: 'overlay', title: 'Paused' }));
  await ui.go('a'); assert.equal(say(), 'Main menu'); await ui.go('b', { n: 7 }); assert.equal(say(), 'Level 7');
  await ui.go('b', { n: 7 }).catch(() => {}); await ui.go('a'); await ui.go('a'); assert.equal(say(), 'Main menu');
  await ui.open('o'); assert.equal(say(), 'Paused'); await ui.close(); await ui.go('c'); assert.equal(ui.current.id, 'c');
});
test('subscribe reports every change and can be unsubscribed', async () => {
  const { ui } = make(); reg(ui, 'a', 'b', overlay('o')); const seen = []; const off = ui.subscribe(s => seen.push(`${s.current.id}+${s.overlays.join()}`));
  await ui.go('a'); await ui.open('o'); await ui.close(); await ui.go('b'); off(); await ui.go('a');
  assert.deepEqual(seen, ['a+', 'a+o', 'a+', 'b+']);
});
test('destroy(): everything is left and destroyed (persistent included), listeners gone, later calls rejected', async () => {
  const { ui } = make(); reg(ui, def('p', { persistent: true }), 'x', overlay('o'));
  await ui.go('p'); await ui.go('x'); await ui.open('o'); L.length = 0;
  ui.destroy(); ui.destroy();
  assert.equal(document.querySelectorAll('[data-mp-stage]').length, 0); assert.equal(wrappers().length, 0);
  for (const id of ['p', 'x', 'o']) assert.equal(L.filter(e => e === `${id}:destroy`).length, 1, id);
  assert.ok(L.indexOf('o:leave') < L.indexOf('x:leave')); assert.equal((await ui.go('x')).reason, 'destroyed'); assert.equal((await ui.open('o')).reason, 'destroyed');
  assert.doesNotThrow(() => key('Escape'));
});

// ═════════════════════════════════════════════════════════════════════════
group('Re-entrant navigation from lifecycle hooks (queued, run after the current navigation)');

// A screen whose hooks can call back into the manager. `hooks.create(ctx)` runs inside create(), i.e. before the manager has a record for it.
const hooked = (id, hooks = {}, over = {}) => def(id, {
  create(ctx) {
    L.push(`${id}:create:${ctx.presentation}`);
    ctx.onDestroy(() => L.push(`${id}:cleanup:${ctx.presentation}`));
    const el = h('div', { class: `s-${id}` }, h('button', { class: 'b1', type: 'button' }, id), h('button', { class: 'b2', type: 'button' }, 'two'));
    hooks.create?.(ctx);
    return {
      el, initialFocus: '.b1',
      enter: (...a) => { L.push(`${id}:enter`); hooks.enter?.(...a); },
      leave: (...a) => { L.push(`${id}:leave`); hooks.leave?.(...a); },
      destroy: (...a) => { L.push(`${id}:destroy`); hooks.destroy?.(...a); },
    };
  },
  ...over,
});
/** Wait for the fake clock to run every chained transition, and make sure no returned promise hangs. */
async function finish(c, promises = []) {
  for (let i = 0; i < 8; i++) c.tick(1000);
  let timer; const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('a navigation promise never settled')), 300); });
  try { return await Promise.race([Promise.all(promises), guard]); } finally { clearTimeout(timer); }
}
/** Invariants after everything settled: no stuck state, no orphan wrapper, no leaked instance, no timer. */
function assertClean(ui, c) {
  assert.equal(c.pending, 0, 'no timer left'); assert.equal(ui.transitioning, false, 'not transitioning');
  const ws = wrappers();
  assert.deepEqual(ws.map(x => `${x.dataset.screen}:${x.dataset.state}`), ws.map(x => `${x.dataset.screen}:active`), 'no wrapper stuck entering/leaving');
  assert.equal(ws.length, 1 + ui.overlays.length, `exactly one wrapper per live layer, got ${ws.map(x => x.dataset.screen)}`);
  assert.equal(interactive().length, 1, 'exactly one interactive layer');
  const created = L.filter(x => x.includes(':create:')).length, destroyed = L.filter(x => x.endsWith(':destroy')).length;
  assert.equal(created, destroyed + ws.length, `leaked instances (created ${created}, destroyed ${destroyed}, live ${ws.length})`);
  for (const id of new Set(L.filter(x => x.endsWith(':create:screen') || x.endsWith(':create:overlay')).map(x => x.split(':')[0]))) {
    const n = (suffix) => L.filter(x => x === `${id}:${suffix}`).length;
    assert.ok(n('destroy') <= n('create:screen') + n('create:overlay'), `${id} destroyed more often than created`);
  }
}

for (const ms of [750, 0]) {
  const tag = `${ms}ms`;
  const setup = () => { const m = make({ transitionMs: ms }); return m; };

  test(`navigation from create() is queued, not interleaved (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'a', 'b');
    reg(ui, hooked('r', { create: () => ui.go('b', {}, { replace: true }) }));
    await finish(c, [ui.go('a')]);
    const results = await finish(c, [ui.go('r')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'b'); assert.deepEqual(hist(ui), ['a']); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['b']);
    assert.equal(L.filter(x => x === 'r:destroy').length, 1); assert.equal(L.filter(x => x === 'r:leave').length, 1);
    assertClean(ui, c);
  });

  test(`navigation from enter() is queued (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'a', 'b');
    reg(ui, hooked('e', { enter: () => ui.go('b', {}, { replace: true }) }));
    await finish(c, [ui.go('a')]);
    const results = await finish(c, [ui.go('e')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'b'); assert.deepEqual(hist(ui), ['a']); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['b']);
    assert.equal(L.filter(x => x === 'e:destroy').length, 1); assert.equal(L.filter(x => x === 'a:destroy').length, 1);
    assertClean(ui, c);
  });

  test(`navigation from leave() is queued, and leave runs once (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'b', 'c');
    reg(ui, hooked('a', { leave: info => { if (info.to === 'c') ui.go('b'); } }));
    await finish(c, [ui.go('a')]);
    const results = await finish(c, [ui.go('c')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'b'); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['b']);
    for (const id of ['a', 'c']) assert.equal(L.filter(x => x === `${id}:destroy`).length, 1, id);
    assert.equal(L.filter(x => x === 'a:leave').length, 1);
    assertClean(ui, c);
  });

  test(`opening an overlay from enter() works and closes cleanly (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, overlay('o'));
    reg(ui, hooked('s', { enter: () => ui.open('o') }));
    const results = await finish(c, [ui.go('s')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.deepEqual(ui.overlays, ['o']); assert.deepEqual(wrappers().map(x => x.dataset.screen).sort(), ['o', 's']);
    assert.ok(w('s').hasAttribute('inert')); assert.deepEqual(interactive().map(x => x.dataset.screen), ['o']);
    assertClean(ui, c);
    await finish(c, [ui.close()]);
    assert.deepEqual(ui.overlays, []); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['s']); assert.equal(L.filter(x => x === 'o:destroy').length, 1);
    assertClean(ui, c);
  });

  test(`navigation from an overlay's leave() on close() is queued (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 's', 'b', hooked('o', { leave: info => { if (info.reason === 'close') ui.go('b'); } }, { presentation: 'overlay' }));
    await finish(c, [ui.go('s')]); await finish(c, [ui.open('o')]);
    const results = await finish(c, [ui.close()]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'b'); assert.deepEqual(ui.overlays, []); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['b']);
    assert.equal(L.filter(x => x === 'o:destroy').length, 1); assert.equal(L.filter(x => x === 'o:leave').length, 1);
    assertClean(ui, c);
  });

  test(`navigation from destroy() while a transition settles is queued (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'b', 'c'); let fired = false;
    reg(ui, hooked('a', { destroy: () => { if (!fired) { fired = true; ui.go('c'); } } }));
    await finish(c, [ui.go('a')]);
    const results = await finish(c, [ui.go('b')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'c'); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['c']);
    for (const id of ['a', 'b']) assert.equal(L.filter(x => x === `${id}:destroy`).length, 1, id);
    assertClean(ui, c);
  });

  test(`navigation from a subscriber is queued (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'a', 'b', 'x'); let fired = false;
    ui.subscribe(({ current }) => { if (current?.id === 'x' && !fired) { fired = true; ui.go('b'); } });
    await finish(c, [ui.go('a')]);
    const results = await finish(c, [ui.go('x')]);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(ui.current.id, 'b'); assert.deepEqual(wrappers().map(x => x.dataset.screen), ['b']);
    assertClean(ui, c);
  });

  test(`a request queued from a hook is validated when it runs, not when it was made (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, def('a', { to: ['b'] }), 'b', 'x');
    reg(ui, hooked('r', { enter: () => ui.go('x').then(res => L.push(`redirect:${res.ok}:${res.reason ?? ''}`)) }, { to: ['b'] }));
    await finish(c, [ui.go('a')]); await finish(c, [ui.go('b')]);
    ui.go('r'); await finish(c);
    assert.equal(ui.current.id, 'r'); assert.ok(L.includes('redirect:false:not-allowed'), L.join()); // r.to = ['b'], so x is refused and nothing changes
    assertClean(ui, c);
  });

  test(`ui.destroy() called from a hook is deferred, then tears everything down once (${tag})`, async () => {
    const { ui, c } = setup(); reg(ui, 'a', hooked('d', { enter: () => ui.destroy() }));
    await finish(c, [ui.go('a')]);
    const p = ui.go('d'); await finish(c, [p]);
    assert.equal(document.querySelectorAll('[data-mp-stage]').length, 0); assert.equal(wrappers().length, 0);
    for (const id of ['a', 'd']) assert.equal(L.filter(x => x === `${id}:destroy`).length, 1, id);
    assert.equal((await ui.go('a')).reason, 'destroyed'); assert.equal(c.pending, 0);
  });
}

test('top-level calls stay synchronous: nothing is queued when no hook is running', async () => {
  const { ui, c } = make({ transitionMs: 750 }); reg(ui, 'a', 'b');
  ui.go('a'); assert.equal(ui.current.id, 'a'); assert.equal(wrappers().length, 1);
  ui.go('b'); assert.equal(ui.current.id, 'b'); assert.equal(w('a').dataset.state, 'leaving'); c.tick(750);
});

// ── Run ───────────────────────────────────────────────────────────────────
for (const [name, fn] of queue) {
  if (!fn) { console.log(name); continue; }
  L.length = 0;
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.error('  FAIL', name, '\n      ', (e.stack || e.message).split("\n").slice(0, 9).join('\n       ')); }
  finally { managers.splice(0).forEach(m => m.destroy()); document.body.innerHTML = ''; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
