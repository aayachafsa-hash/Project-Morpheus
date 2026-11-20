// Step 3 test suite: the six game screens, their wiring, the settings store and the level logic.
// Environment-agnostic on purpose: it only needs a global `document` (jsdom or a real browser) and no timers except
// a fake clock for the boot screen. Entry points:
//   node tests/game-screens.test.mjs      jsdom (same setup as smoke.test.mjs / screens.test.mjs; needs `npm i jsdom`)
//   node tests/game-screens.browser.mjs   real Chromium through Playwright (also exercises real layout and real key presses)
// Tests that need real layout or a real browser are marked with `layout` and are skipped, and reported as skipped, elsewhere.

import { createScreenManager, h } from '../src/ui/index.js';
import * as GS from '../src/ui/game-screens/index.js';
import { runBoot } from '../src/ui/game-screens/boot.js';
import { coerce } from '../src/ui/game-screens/settings-store.js';
import { countColumns } from '../src/ui/game-screens/keynav.js';

// ── Tiny assert (no node: imports, so this file also runs in a browser) ────────────────────────────────
const show = value => { try { return JSON.stringify(value); } catch { return String(value); } };
const fail = message => { throw new Error(message); };
const assert = {
  ok: (value, message) => { if (!value) fail(message || `expected a truthy value, got ${show(value)}`); },
  equal: (actual, expected, message) => { if (actual !== expected) fail(message || `expected ${show(expected)} but got ${show(actual)}`); },
  deepEqual: (actual, expected, message) => { if (show(actual) !== show(expected)) fail(message || `expected ${show(expected)} but got ${show(actual)}`); },
  match: (text, pattern, message) => { if (!pattern.test(text)) fail(message || `expected ${show(text)} to match ${pattern}`); },
  throws: (fn, pattern) => {
    try { fn(); } catch (error) { if (pattern && !pattern.test(String(error.message))) fail(`threw "${error.message}", expected ${pattern}`); return; }
    fail('expected a throw');
  },
};

export async function runSuite({ layout = false, log = () => {} } = {}) {
  const tests = [];
  const test = (name, fn, { needsLayout = false } = {}) => tests.push({ name, fn, needsLayout });
  const group = name => tests.push({ group: name });

  // ── Harness ────────────────────────────────────────────────────────────────────────────────────────────
  const live = [];                                  // everything to tear down after each test
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const layer = id => q(`.mp-screen[data-screen="${id}"]`);
  // A menu item is `Label` + an optional description span, so compare against its label only.
  const labelOf = b => (b.classList.contains('mp-menu-item') ? (b.firstElementChild?.firstChild?.textContent ?? '') : text(b)).trim();
  const buttonByLabel = (root, label) => qa('button', root).find(b => labelOf(b) === label);
  const press = (name, init = {}, target = document.activeElement || document.body) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event); return event;
  };
  const announced = () => text(q('.mp-stage__announcer'));

  function clock() {
    let now = 0; const timers = new Set();
    return {
      schedule: (fn, ms) => { const t = { fn, at: now + ms }; timers.add(t); return () => timers.delete(t); },
      tick(ms) { now += ms; for (const t of [...timers].filter(t => t.at <= now).sort((a, b) => a.at - b.at)) if (timers.delete(t)) t.fn(); },
      get pending() { return timers.size; },
    };
  }

  const LEVELS = [['a', 'Alpha'], ['b', 'Bravo'], ['c', 'Charlie'], ['d', 'Delta'], ['e', 'Echo']].map(([id, name]) => ({ id, name }));
  const many = count => Array.from({ length: count }, (_, i) => ({ id: `l${i + 1}`, name: `Level ${i + 1}`, iconName: 'fish' }));

  /** A manager with all six screens + (optionally) a stand-in gameplay screen, a fake clock and collected warnings. */
  function build({ levels = LEVELS, progress = { completed: { a: 3, b: 1 } }, callbacks = {}, load, minBootMs = 0, withGame = true, storage, managerOptions = {}, settingsOptions = {} } = {}) {
    const c = clock(); const warnings = []; const entered = [];
    const settings = GS.createSettingsStore({ storage, reducedMotion: () => false, ...settingsOptions });
    const ui = createScreenManager({ schedule: c.schedule, transitionMs: 0, reducedMotion: () => true, warn: (...a) => warnings.push(a), ...managerOptions });
    const screens = GS.registerGameScreens(ui, { settings, levels, progress, load, minBootMs, schedule: c.schedule, callbacks, warn: (...a) => warnings.push(a) });
    if (withGame) {
      ui.register({
        id: 'game', to: '*', persistent: true, keys: 'passthrough', history: false, backdrop: false,
        create(ctx) {
          const pause = h('button', { type: 'button', id: 'game-pause' }, 'Pause');
          ctx.listen(pause, 'click', () => ctx.manager.open('pause', { levelName: 'Alpha' }));
          return { el: h('div', { class: 'stub-game' }, pause), enter: params => entered.push(params) };
        },
      });
    }
    live.push(() => { screens.dispose(); ui.destroy(); });
    return { ui, c, warnings, entered, settings, screens };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Registration and instantiation');

  test('registerGameScreens registers the six screens; only the gameplay id is left for Step 4', () => {
    const { ui } = build({ withGame: false });
    for (const id of ['boot', 'main-menu', 'level-select', 'settings', 'pause', 'results']) assert.ok(ui.has(id), `${id} not registered`);
    const problems = ui.validate();
    assert.ok(problems.length > 0 && problems.every(p => p.to === 'game'), `unexpected problems: ${show(problems)}`);
    assert.deepEqual(problems.map(p => p.from).sort(), ['level-select', 'results']);
  });
  test('with a gameplay screen registered the whole navigation graph validates', () => {
    assert.deepEqual(build().ui.validate(), []);
  });
  test('createGameScreens builds definitions without registering them; ids can be overridden', () => {
    const ui = createScreenManager({ transitionMs: 0 }); live.push(() => ui.destroy());
    const { definitions, dispose } = GS.createGameScreens(ui, { ids: { mainMenu: 'home' } });
    dispose();
    assert.equal(definitions.length, 6);
    assert.ok(!ui.has('boot'));
    assert.ok(definitions.find(d => d.id === 'boot').to.includes('home'));
    ui.register(definitions);
    assert.throws(() => ui.register(definitions[0]), /already registered/);
  });
  for (const id of ['boot', 'main-menu', 'level-select', 'settings', 'results']) {
    test(`"${id}" can be instantiated and mounts its own screen`, async () => {
      const { ui, warnings } = build({ load: () => new Promise(() => {}) });
      const result = await ui.go(id, id === 'results' ? { outcome: 'success' } : {});
      assert.ok(result.ok, show(result));
      assert.equal(ui.current.id, id);
      assert.ok(layer(id), 'no wrapper');
      assert.equal(layer(id).dataset.layer, 'screen');
      assert.deepEqual(warnings, []);
    });
  }
  test('"pause" and "settings" can be instantiated as overlays above the gameplay screen', async () => {
    const { ui, warnings } = build();
    await ui.go('game'); await ui.open('pause');
    assert.equal(layer('pause').dataset.layer, 'overlay');
    await ui.close(); await ui.open('pause'); await ui.open('settings');
    assert.equal(layer('settings').dataset.layer, 'overlay');
    assert.deepEqual(ui.overlays, ['pause', 'settings']);
    assert.deepEqual(warnings, []);
  });
  test('two instances of the same screens never share an element id', async () => {
    const one = build({ managerOptions: { backdrop: false } }); const two = build({ managerOptions: { backdrop: false } }); // the kit's backdrop owns fixed svg ids: one per page by design
    await one.ui.go('settings'); await two.ui.go('settings');
    const ids = qa('[id]').map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Presentation is separate from navigation: screens only call the actions they are given');

  test('each screen module calls its actions and does not navigate on its own', async () => {
    const ids = GS.DEFAULT_IDS; const calls = [];
    const spy = name => (...args) => { calls.push([name, ...args]); };
    const ui = createScreenManager({ transitionMs: 0, reducedMotion: () => false }); live.push(() => ui.destroy());
    const settings = GS.createSettingsStore({ reducedMotion: () => false });
    ui.register([
      GS.mainMenuScreen({ ids, actions: { play: spy('play'), settings: spy('menu-settings') } }),
      GS.levelSelectScreen({ ids, actions: { select: spy('select'), back: spy('levels-back') }, levels: LEVELS, progress: { completed: {} } }),
      GS.pauseScreen({ ids, actions: { resume: spy('resume'), restart: spy('restart'), settings: spy('pause-settings'), mainMenu: spy('quit') } }),
      GS.resultsScreen({ ids, actions: { retry: spy('retry'), next: spy('next'), levels: spy('levels'), mainMenu: spy('results-menu') } }),
      GS.settingsScreen({ ids, actions: { back: spy('settings-back'), close: spy('settings-close'), reset: spy('reset') }, settings }),
    ]);
    await ui.go('main-menu');
    buttonByLabel(layer('main-menu'), 'Play').click(); buttonByLabel(layer('main-menu'), 'Settings').click();
    assert.equal(ui.current.id, 'main-menu', 'the screen navigated by itself');
    assert.deepEqual(calls.map(c => c[0]), ['play', 'menu-settings']);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Boot / loading screen');

  test('shows the brand, a progress bar and the loader\'s progress and message', async () => {
    let progress; const { ui } = build({ load: p => { progress = p.progress; return new Promise(() => {}); } });
    await ui.go('boot'); await flush();
    const el = layer('boot');
    assert.equal(text(q('h1', el)), 'Morpheus');
    const bar = q('[role="progressbar"]', el);
    assert.equal(bar.getAttribute('aria-valuenow'), '0');
    assert.equal(q('section', el).getAttribute('aria-busy'), 'true');
    progress(40, 'Casting shadows…');
    assert.equal(bar.getAttribute('aria-valuenow'), '40');
    assert.equal(text(q('.mp-gs-boot__status', el)), 'Casting shadows…');
  });
  test('goes to the main menu when loading is done AND the minimum time has passed; boot is not in history', async () => {
    const done = []; const { ui, c } = build({ minBootMs: 1000, callbacks: { onBootComplete: () => done.push(1) } });
    await ui.go('boot'); await flush();
    assert.equal(ui.current.id, 'boot', 'left before the minimum time');
    c.tick(999); await flush(); assert.equal(ui.current.id, 'boot');
    c.tick(1); await flush();
    assert.equal(ui.current.id, 'main-menu');
    assert.deepEqual(ui.history, []);
    assert.equal(done.length, 1);
    assert.equal(layer('boot'), null, 'boot DOM left behind');
  });
  test('a slow loader keeps boot on screen even after the minimum time', async () => {
    let finish; const { ui, c } = build({ minBootMs: 100, load: () => new Promise(resolve => { finish = resolve; }) });
    await ui.go('boot'); c.tick(500); await flush();
    assert.equal(ui.current.id, 'boot');
    finish(); await flush();
    assert.equal(ui.current.id, 'main-menu');
  });
  test('a failing loader shows an alert with Retry; Retry runs the loader again and then continues', async () => {
    let attempts = 0; const errors = [];
    const { ui } = build({ callbacks: { onBootError: e => errors.push(e.message) }, load: async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); } });
    await ui.go('boot'); await flush();
    const el = layer('boot'); const alert = q('[role="alert"]', el);
    assert.ok(!alert.hidden, 'alert hidden');
    assert.ok(q('.mp-gs-boot__loading', el).hidden, 'progress still shown');
    assert.equal(ui.current.id, 'boot');
    assert.deepEqual(errors, ['offline']);
    assert.equal(document.activeElement, buttonByLabel(alert, 'Retry'));
    buttonByLabel(alert, 'Retry').click(); await flush();
    assert.equal(attempts, 2);
    assert.equal(ui.current.id, 'main-menu');
  });
  test('leaving boot while it loads cancels everything: no late navigation, no pending timer, no warnings', async () => {
    let finish; const done = [];
    const { ui, c, warnings } = build({ minBootMs: 1000, callbacks: { onBootComplete: () => done.push(1) }, load: () => new Promise(resolve => { finish = resolve; }) });
    await ui.go('boot');
    await ui.go('main-menu');
    assert.equal(c.pending, 0, 'timer left running');
    finish(); await flush(); c.tick(5000); await flush();
    assert.equal(ui.current.id, 'main-menu'); assert.equal(done.length, 0); assert.deepEqual(warnings, []);
  });
  test('runBoot clamps progress to 0..100 and reports nothing after cancel', async () => {
    const seen = []; let progress; const sched = clock();
    const cancel = runBoot({ minDurationMs: 0, schedule: sched.schedule, onProgress: v => seen.push(v), onDone: () => seen.push('done'), onError: () => seen.push('error'),
      load: async p => { progress = p.progress; progress(-5); progress(140); progress(NaN); progress(50); } });
    await flush();
    assert.deepEqual(seen, [0, 100, 0, 50, 100, 'done']);
    const later = []; const cancel2 = runBoot({ minDurationMs: 0, schedule: sched.schedule, onProgress: v => later.push(v), onDone: () => later.push('done'), onError: () => {}, load: async () => {} });
    cancel2(); await flush(); assert.deepEqual(later, []); cancel();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Main menu');

  test('Play and Settings navigate through the screen manager', async () => {
    const { ui } = build();
    await ui.go('main-menu');
    buttonByLabel(layer('main-menu'), 'Play').click();
    assert.equal(ui.current.id, 'level-select'); assert.deepEqual(ui.history.map(e => e.id), ['main-menu']);
    await ui.back();
    buttonByLabel(layer('main-menu'), 'Settings').click();
    assert.equal(ui.current.id, 'settings');
  });
  test('shows the title and only the destinations this project has', async () => {
    const { ui } = build(); await ui.go('main-menu');
    assert.equal(text(q('h1', layer('main-menu'))), 'Morpheus');
    assert.deepEqual(qa('.mp-menu-item', layer('main-menu')).map(labelOf), ['Play', 'Settings']);
    assert.equal(q('nav', layer('main-menu')).getAttribute('aria-label'), 'Main menu');
  });
  test('initial focus is Play; arrow keys, Home and End move focus; Escape does nothing here', async () => {
    const { ui } = build(); await ui.go('main-menu');
    const [play, settings] = qa('.mp-menu-item', layer('main-menu'));
    assert.equal(document.activeElement, play);
    press('ArrowDown'); assert.equal(document.activeElement, settings);
    press('ArrowDown'); assert.equal(document.activeElement, play, 'does not wrap forward');
    press('ArrowUp'); assert.equal(document.activeElement, settings, 'does not wrap back');
    press('Home'); assert.equal(document.activeElement, play);
    press('End'); assert.equal(document.activeElement, settings);
    press('Escape'); assert.equal(ui.current.id, 'main-menu');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Level selection');

  test('resolveLevels: linear unlock, explicit states, stars, sources as functions', () => {
    const r = GS.resolveLevels(LEVELS, { completed: { a: 3, b: 7 } });
    assert.deepEqual(r.map(l => l.state), ['complete', 'complete', 'current', 'locked', 'locked']);
    assert.deepEqual(r.map(l => l.stars), [3, 3, 0, 0, 0], 'stars clamp to 3 and only count when complete');
    assert.deepEqual(r.map(l => l.number), [1, 2, 3, 4, 5]);
    assert.ok(r[3].locked && !r[2].locked);
    assert.deepEqual(GS.resolveLevels(LEVELS, { completed: {} }).map(l => l.state), ['current', 'locked', 'locked', 'locked', 'locked']);
    assert.deepEqual(GS.resolveLevels(LEVELS, { unlockAll: true }).map(l => l.state), ['current', 'available', 'available', 'available', 'available']);
    assert.deepEqual(GS.resolveLevels(LEVELS, { unlocked: ['d'] }).map(l => l.state), ['current', 'locked', 'locked', 'available', 'locked']);
    assert.equal(GS.resolveLevels([{ id: 'x', state: 'locked' }], {})[0].state, 'locked', 'explicit state wins');
    assert.equal(GS.resolveLevels([{ id: 'x', state: 'bogus' }], {})[0].state, 'current', 'an invalid explicit state is ignored');
    assert.equal(GS.resolveLevels(() => LEVELS, () => ({ completed: { a: 0 } }))[0].state, 'complete');
    assert.deepEqual(GS.resolveLevels(undefined, undefined), []);
    assert.deepEqual(GS.summarizeLevels(GS.resolveLevels(LEVELS, { completed: { a: 3, b: 1 } })), { total: 5, unlocked: 3, stars: 4, maxStars: 15 });
  });
  test('resolveLevels rejects levels without a usable id', () => {
    assert.throws(() => GS.resolveLevels([{ name: 'x' }]), /needs a string or number id/);
    assert.throws(() => GS.resolveLevels({}), /must be an array/);
  });
  test('the default catalogue is the one level the prototype really has', () => {
    assert.deepEqual(GS.PROTOTYPE_LEVELS.map(l => l.id), ['aquafish']);
  });
  test('renders one tile per level with state, stars and an accessible name; the summary matches', async () => {
    const { ui } = build(); await ui.go('level-select');
    const tiles = qa('.mp-level-tile', layer('level-select'));
    assert.deepEqual(tiles.map(t => t.dataset.state), ['complete', 'complete', 'current', 'locked', 'locked']);
    assert.equal(tiles[0].getAttribute('aria-label'), 'Level 01, Alpha, 3 of 3 stars');
    assert.match(tiles[3].getAttribute('aria-label'), /locked$/);
    assert.equal(tiles[3].getAttribute('aria-disabled'), 'true');
    assert.equal(tiles[2].getAttribute('aria-disabled'), null);
    assert.equal(text(q('[data-summary]', layer('level-select'))), '3 of 5 unlocked · 4 of 15 stars');
    assert.equal(q('ol', layer('level-select')).getAttribute('aria-label'), 'Levels');
  });
  test('locked levels cannot be selected, and activating one explains why', async () => {
    const picked = []; const { ui } = build({ callbacks: { onSelectLevel: l => picked.push(l.id) } }); await ui.go('level-select');
    const locked = q('[data-level="d"]', layer('level-select'));
    locked.click(); locked.click();
    assert.deepEqual(picked, []); assert.equal(ui.current.id, 'level-select');
    assert.match(announced(), /Level 04 is locked\. Complete level 03 to unlock it\./);
    locked.focus(); assert.equal(document.activeElement, locked, 'locked tiles stay focusable');
  });
  test('an available level calls onSelectLevel(level) and then starts the gameplay screen with that level', async () => {
    const picked = []; const { ui, entered } = build({ callbacks: { onSelectLevel: l => picked.push({ id: l.id, number: l.number, state: l.state }) } });
    await ui.go('level-select');
    q('[data-level="c"]', layer('level-select')).click();
    assert.deepEqual(picked, [{ id: 'c', number: 3, state: 'current' }]);
    assert.equal(ui.current.id, 'game'); assert.deepEqual(ui.current.params, { level: 'c' }); assert.deepEqual(entered, [{ level: 'c' }]);
  });
  test('completed levels can be replayed', async () => {
    const { ui } = build(); await ui.go('level-select');
    q('[data-level="a"]', layer('level-select')).click();
    assert.deepEqual(ui.current, { id: 'game', params: { level: 'a' } });
  });
  test('onSelectLevel returning false cancels the navigation', async () => {
    const { ui } = build({ callbacks: { onSelectLevel: () => false } }); await ui.go('level-select');
    q('[data-level="c"]', layer('level-select')).click();
    assert.equal(ui.current.id, 'level-select');
  });
  test('initial focus is the current level', async () => {
    const { ui } = build(); await ui.go('level-select');
    assert.equal(document.activeElement, q('[data-level="c"]', layer('level-select')));
  });
  test('arrow keys move between tiles; Home/End jump; the grid does not wrap', async () => {
    const { ui } = build(); await ui.go('level-select');
    const tile = id => q(`[data-level="${id}"]`, layer('level-select'));
    press('ArrowLeft'); assert.equal(document.activeElement, tile('b'));
    press('ArrowRight'); press('ArrowRight'); assert.equal(document.activeElement, tile('d'), 'moves onto a locked tile (focusable)');
    press('End'); assert.equal(document.activeElement, tile('e'));
    press('ArrowRight'); assert.equal(document.activeElement, tile('e'), 'no wrap at the end');
    press('Home'); press('ArrowLeft'); assert.equal(document.activeElement, tile('a'), 'no wrap at the start');
  });
  test('arrow Up/Down move by a row when the tiles wrap onto several rows', async () => {
    const { ui } = build({ levels: many(12), progress: { unlockAll: true } }); await ui.go('level-select');
    const tiles = qa('.mp-level-tile', layer('level-select'));
    const columns = countColumns(tiles);
    assert.ok(columns > 1 && columns < 12, `expected a wrapped grid, got ${columns} columns`);
    tiles[0].focus(); press('ArrowDown'); assert.equal(document.activeElement, tiles[columns]);
    press('ArrowUp'); assert.equal(document.activeElement, tiles[0]);
    press('ArrowUp'); assert.equal(document.activeElement, tiles[0], 'stays on the first row');
  }, { needsLayout: true });
  test('Back and Escape return to the main menu; opened directly, Back still ends up on the main menu', async () => {
    const { ui } = build(); await ui.go('main-menu'); await ui.go('level-select');
    buttonByLabel(layer('level-select'), 'Back').click(); await flush();
    assert.equal(ui.current.id, 'main-menu');
    await ui.go('level-select'); press('Escape'); await flush();
    assert.equal(ui.current.id, 'main-menu');
    const direct = build(); await direct.ui.go('level-select');
    buttonByLabel(layer('level-select'), 'Back').click(); await flush();
    assert.equal(direct.ui.current.id, 'main-menu'); assert.deepEqual(direct.ui.history, []);
    const viaKey = build(); await viaKey.ui.go('level-select'); press('Escape'); await flush();
    assert.equal(viaKey.ui.current.id, 'main-menu', 'Escape with no history');
    const settingsKey = build(); await settingsKey.ui.go('settings'); press('Escape'); await flush();
    assert.equal(settingsKey.ui.current.id, 'main-menu', 'settings opened directly: Escape');
    const settingsBtn = build(); await settingsBtn.ui.go('settings'); buttonByLabel(layer('settings'), 'Back').click(); await flush();
    assert.equal(settingsBtn.ui.current.id, 'main-menu', 'settings opened directly: Back button');
  });
  test('an empty catalogue shows a message, no tiles, and focus lands on Back', async () => {
    const { ui } = build({ levels: [] }); await ui.go('level-select');
    assert.equal(qa('.mp-level-tile').length, 0);
    assert.equal(text(q('.mp-gs-empty')), 'No levels are available yet.');
    assert.equal(document.activeElement, buttonByLabel(layer('level-select'), 'Back'));
  });
  test('levels and progress are read on every visit', async () => {
    let progress = { completed: {} }; const { ui } = build({ progress: () => progress });
    await ui.go('main-menu'); await ui.go('level-select');
    assert.equal(text(q('[data-summary]')), '1 of 5 unlocked');
    await ui.back(); progress = { completed: { a: 2 } }; await ui.go('level-select');
    assert.equal(text(q('[data-summary]')), '2 of 5 unlocked · 2 of 15 stars');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Settings store');

  test('defaults, get/getAll and unknown keys', () => {
    const s = GS.createSettingsStore({ reducedMotion: () => false });
    assert.equal(s.get('masterVolume'), 80); assert.equal(s.get('quality'), 'high'); assert.equal(s.get('controlHints'), true);
    assert.equal(Object.keys(s.getAll()).length, GS.SETTINGS_SCHEMA.length);
    assert.throws(() => s.get('nope'), /unknown setting/); assert.throws(() => s.set('nope', 1), /unknown setting/);
    s.getAll().masterVolume = 1; assert.equal(s.get('masterVolume'), 80, 'getAll returns a copy');
  });
  test('set clamps and snaps ranges, ignores invalid values, and returns the value in effect', () => {
    const s = GS.createSettingsStore({ reducedMotion: () => false });
    assert.equal(s.set('masterVolume', 37), 35); assert.equal(s.set('masterVolume', '65'), 65);
    assert.equal(s.set('masterVolume', 500), 100); assert.equal(s.set('masterVolume', -3), 0);
    for (const bad of ['abc', NaN, null, undefined, {}, '']) assert.equal(s.set('masterVolume', bad), 0, `accepted ${show(bad)}`);
    assert.equal(s.set('muted', 'yes'), false); assert.equal(s.set('muted', true), true);
    assert.equal(s.set('quality', 'ultra'), 'high'); assert.equal(s.set('quality', 'low'), 'low');
    assert.equal(s.set('sensitivity', 149), 150);
  });
  test('subscribers get { key, value, previous } only for real changes, and can unsubscribe', () => {
    const s = GS.createSettingsStore({ reducedMotion: () => false }); const seen = [];
    const off = s.subscribe(change => seen.push(change));
    s.set('masterVolume', 80); s.set('masterVolume', 'junk'); assert.deepEqual(seen, []);
    s.set('masterVolume', 50); assert.deepEqual(seen, [{ key: 'masterVolume', value: 50, previous: 80 }]);
    assert.equal(s.listenerCount, 1); off(); assert.equal(s.listenerCount, 0);
    s.set('masterVolume', 10); assert.equal(seen.length, 1);
  });
  test('a throwing subscriber is reported and does not stop the others', () => {
    const warned = []; const s = GS.createSettingsStore({ reducedMotion: () => false, warn: (...a) => warned.push(a) }); let reached = false;
    s.subscribe(() => { throw new Error('boom'); }); s.subscribe(() => { reached = true; });
    s.set('muted', true); assert.ok(reached); assert.equal(warned.length, 1);
  });
  test('reset restores every default and notifies for each change', () => {
    const s = GS.createSettingsStore({ reducedMotion: () => false }); s.set('muted', true); s.set('quality', 'low'); s.set('masterVolume', 5);
    const keys = []; s.subscribe(c => keys.push(c.key)); s.reset();
    assert.deepEqual(s.getAll(), Object.fromEntries(GS.SETTINGS_SCHEMA.map(d => [d.key, d.default])));
    assert.deepEqual(keys.sort(), ['masterVolume', 'muted', 'quality']);
  });
  test('persistence: saves on change, restores on creation, ignores corrupt, unknown and invalid stored data', () => {
    const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const a = GS.createSettingsStore({ storage, reducedMotion: () => false }); a.set('masterVolume', 25); a.set('muted', true);
    const b = GS.createSettingsStore({ storage, reducedMotion: () => false });
    assert.equal(b.get('masterVolume'), 25); assert.equal(b.get('muted'), true); assert.equal(b.get('quality'), 'high');
    data.set('morpheus.settings', '{not json'); assert.equal(GS.createSettingsStore({ storage, reducedMotion: () => false }).get('masterVolume'), 80);
    data.set('morpheus.settings', JSON.stringify({ masterVolume: 'loud', ghost: 1, quality: 'low', muted: 'x' }));
    const c = GS.createSettingsStore({ storage, reducedMotion: () => false });
    assert.equal(c.get('masterVolume'), 80); assert.equal(c.get('quality'), 'low'); assert.equal(c.get('muted'), false);
    assert.equal(GS.createSettingsStore({ initial: { musicVolume: 10 }, reducedMotion: () => false }).get('musicVolume'), 10);
  });
  test('a storage that throws never breaks the store', () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
    const s = GS.createSettingsStore({ storage, reducedMotion: () => false });
    assert.equal(s.set('masterVolume', 40), 40);
  });
  test('reducedMotion is true when the setting OR the system asks for it', () => {
    assert.equal(GS.createSettingsStore({ reducedMotion: () => false }).reducedMotion(), false);
    assert.equal(GS.createSettingsStore({ reducedMotion: () => true }).reducedMotion(), true);
    const s = GS.createSettingsStore({ reducedMotion: () => false }); s.set('reduceMotion', true); assert.equal(s.reducedMotion(), true);
  });
  test('a broken schema is rejected up front', () => {
    const range = { key: 'v', group: 'audio', type: 'range', label: 'V', min: 0, max: 10, step: 1 };
    assert.throws(() => GS.createSettingsStore({ schema: [{ ...range, default: 99 }] }), /invalid default/);
    assert.throws(() => GS.createSettingsStore({ schema: [{ ...range, default: 1 }, { ...range, default: 2 }] }), /duplicate key/);
    assert.equal(coerce(range, 4.4), 4);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Settings screen');

  const controlFor = (root, label) => qa('.mp-gs-control', root).find(c => text(q('label, .mp-gs-control__label', c)) === label);

  test('renders every setting in the schema, grouped, with its current value', async () => {
    const { ui, settings } = build(); await ui.go('settings');
    const el = layer('settings');
    assert.deepEqual(qa('h3', el).map(text), ['Audio', 'Display', 'Gameplay']);
    for (const def of GS.SETTINGS_SCHEMA) {
      const c = controlFor(el, def.label); assert.ok(c, `no control for "${def.label}"`);
      if (def.type === 'range') { assert.equal(text(q('output', c)), `${def.default}${def.unit}`); assert.equal(q('input', c).value, String(def.default)); }
      if (def.type === 'toggle') { assert.equal(q('[role="switch"]', c).getAttribute('aria-checked'), String(def.default)); assert.equal(text(c).includes(def.default ? 'On' : 'Off'), true); }
      if (def.type === 'choice') assert.equal(q('[aria-checked="true"]', c).dataset.value, def.default);
    }
    assert.equal(settings.listenerCount >= 1, true);
  });
  test('every control has an accessible name', async () => {
    const { ui } = build(); await ui.go('settings');
    for (const input of qa('input[type="range"]', layer('settings'))) assert.ok(input.labels?.[0] ? text(input.labels[0]) : q(`label[for="${input.id}"]`), `unnamed slider ${input.id}`);
    for (const sw of qa('[role="switch"]', layer('settings'))) assert.ok(text(q(`#${sw.getAttribute('aria-labelledby')}`)), 'unnamed switch');
    assert.ok(text(q(`#${q('[role="radiogroup"]', layer('settings')).getAttribute('aria-labelledby')}`)), 'unnamed radio group');
  });
  test('moving a slider updates the readout, aria-valuetext and the store', async () => {
    const { ui, settings } = build(); await ui.go('settings');
    const c = controlFor(layer('settings'), 'Music volume'); const input = q('input', c);
    input.value = '35'; input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(text(q('output', c)), '35%'); assert.equal(input.getAttribute('aria-valuetext'), '35%'); assert.equal(settings.get('musicVolume'), 35);
    const s = controlFor(layer('settings'), 'Rotation sensitivity'); q('input', s).value = '60'; q('input', s).dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(text(q('output', s)), '60%'); assert.equal(settings.get('sensitivity'), 60);
  });
  test('a switch flips on click: aria-checked, visible text and store', async () => {
    const { ui, settings } = build(); await ui.go('settings');
    const c = controlFor(layer('settings'), 'Mute all audio'); const sw = q('[role="switch"]', c);
    sw.click(); assert.equal(sw.getAttribute('aria-checked'), 'true'); assert.match(text(c), /On$/); assert.equal(settings.get('muted'), true);
    sw.click(); assert.equal(sw.getAttribute('aria-checked'), 'false'); assert.match(text(c), /Off$/); assert.equal(settings.get('muted'), false);
  });
  test('a choice selects on click and with arrow keys; one tab stop; wraps at both ends', async () => {
    const { ui, settings } = build(); await ui.go('settings');
    const group = q('[role="radiogroup"]', layer('settings')); const [low, medium, high] = qa('[role="radio"]', group);
    assert.deepEqual([low, medium, high].map(b => b.tabIndex), [-1, -1, 0]);
    low.click(); assert.equal(settings.get('quality'), 'low'); assert.deepEqual([low, medium, high].map(b => b.getAttribute('aria-checked')), ['true', 'false', 'false']);
    assert.deepEqual([low, medium, high].map(b => b.tabIndex), [0, -1, -1]);
    press('ArrowRight', {}, low); assert.equal(settings.get('quality'), 'medium'); assert.equal(document.activeElement, medium);
    press('End', {}, medium); assert.equal(settings.get('quality'), 'high');
    press('ArrowRight', {}, high); assert.equal(settings.get('quality'), 'low', 'wraps to the first');
    press('ArrowLeft', {}, low); assert.equal(settings.get('quality'), 'high', 'wraps to the last');
    press('Home', {}, high); assert.equal(settings.get('quality'), 'low');
  });
  test('changes made elsewhere show up; Reset restores every default and announces it', async () => {
    const { ui, settings } = build(); await ui.go('settings');
    const el = layer('settings');
    settings.set('effectsVolume', 20); assert.equal(text(q('output', controlFor(el, 'Effects volume'))), '20%');
    settings.set('muted', true); settings.set('quality', 'low');
    buttonByLabel(el, 'Reset to defaults').click();
    assert.equal(settings.get('effectsVolume'), 80); assert.equal(text(q('output', controlFor(el, 'Effects volume'))), '80%');
    assert.equal(q('[role="switch"]', controlFor(el, 'Mute all audio')).getAttribute('aria-checked'), 'false');
    assert.equal(q('[aria-checked="true"]', q('[role="radiogroup"]', el)).dataset.value, 'high');
    assert.equal(announced(), 'Settings reset to defaults');
  });
  test('as a screen: Back and Escape return to the previous screen; it is a plain page, not a dialog', async () => {
    const { ui } = build(); await ui.go('main-menu');
    buttonByLabel(layer('main-menu'), 'Settings').click();
    assert.equal(text(q('h1', layer('settings'))), 'Settings'); assert.equal(q('[role="dialog"]', layer('settings')), null);
    assert.equal(document.activeElement, q('.mp-gs-range', layer('settings')), 'focus starts on the first control');
    buttonByLabel(layer('settings'), 'Back').click(); await flush();
    assert.equal(ui.current.id, 'main-menu');
    buttonByLabel(layer('main-menu'), 'Settings').click(); press('Escape'); await flush();
    assert.equal(ui.current.id, 'main-menu');
  });
  test('as an overlay: a labelled modal dialog; Close and Escape close only it and focus returns to its opener', async () => {
    const { ui } = build(); await ui.go('game'); await ui.open('pause');
    const item = buttonByLabel(layer('pause'), 'Settings'); item.focus(); item.click();
    assert.deepEqual(ui.overlays, ['pause', 'settings']);
    const dialog = q('[role="dialog"]', layer('settings'));
    assert.equal(dialog.getAttribute('aria-modal'), 'true'); assert.equal(text(q(`#${dialog.getAttribute('aria-labelledby')}`)), 'Settings');
    assert.ok(layer('pause').hasAttribute('inert'), 'pause not inert underneath');
    buttonByLabel(layer('settings'), 'Close').click();
    assert.deepEqual(ui.overlays, ['pause']); assert.equal(document.activeElement, item);
    item.click(); press('Escape');
    assert.deepEqual(ui.overlays, ['pause']); assert.equal(document.activeElement, item);
  });
  test('leaving the settings screen unsubscribes from the store', async () => {
    const { ui, settings } = build(); await ui.go('main-menu');
    const base = settings.listenerCount;
    await ui.go('settings'); assert.equal(settings.listenerCount, base + 1);
    await ui.back(); assert.equal(settings.listenerCount, base);
  });
  test('values chosen on the settings screen survive leaving and coming back', async () => {
    const { ui } = build(); await ui.go('main-menu'); await ui.go('settings');
    const c = controlFor(layer('settings'), 'Master volume'); q('input', c).value = '20'; q('input', c).dispatchEvent(new Event('input', { bubbles: true }));
    await ui.back(); await ui.go('settings');
    assert.equal(text(q('output', controlFor(layer('settings'), 'Master volume'))), '20%');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Pause screen (overlay)');

  async function paused(options) {
    const ctx = build(options); await ctx.ui.go('game', { level: 'a' });
    const opener = q('#game-pause'); opener.focus(); opener.click();
    return { ...ctx, opener };
  }

  test('opens as a modal overlay: the game underneath is inert and hidden from assistive tech; focus starts on Resume', async () => {
    const { ui } = await paused();
    assert.deepEqual(ui.overlays, ['pause']); assert.equal(ui.current.id, 'game');
    assert.ok(layer('game').hasAttribute('inert')); assert.equal(layer('game').getAttribute('aria-hidden'), 'true');
    assert.ok(!layer('pause').hasAttribute('inert'));
    const dialog = q('[role="dialog"]', layer('pause'));
    assert.equal(dialog.getAttribute('aria-modal'), 'true'); assert.equal(text(q(`#${dialog.getAttribute('aria-labelledby')}`)), 'Paused');
    assert.equal(labelOf(document.activeElement), 'Resume');
    assert.equal(text(q('.mp-text-caption', layer('pause'))), 'Alpha');
    assert.equal(announced(), 'Paused');
  });
  test('Resume closes the overlay, calls onResume once and returns focus to the control that opened it', async () => {
    const calls = []; const { ui, opener } = await paused({ callbacks: { onResume: () => calls.push('resume') } });
    buttonByLabel(layer('pause'), 'Resume').click();
    assert.deepEqual(ui.overlays, []); assert.deepEqual(calls, ['resume']);
    assert.equal(document.activeElement, opener); assert.ok(!layer('game').hasAttribute('inert'));
  });
  test('Escape resumes through the same path (one onResume call, not two)', async () => {
    const calls = []; const { ui } = await paused({ callbacks: { onResume: () => calls.push('resume') } });
    press('Escape'); assert.deepEqual(ui.overlays, []); assert.deepEqual(calls, ['resume']);
  });
  test('onResume returning false keeps the game paused', async () => {
    const { ui } = await paused({ callbacks: { onResume: () => false } });
    buttonByLabel(layer('pause'), 'Resume').click(); press('Escape');
    assert.deepEqual(ui.overlays, ['pause']);
  });
  test('Restart closes the overlay and calls onRestart; the gameplay screen is not re-entered by the UI', async () => {
    const calls = []; const { ui, entered } = await paused({ callbacks: { onRestart: () => calls.push('restart') } });
    buttonByLabel(layer('pause'), 'Restart').click();
    assert.deepEqual(calls, ['restart']); assert.deepEqual(ui.overlays, []); assert.equal(ui.current.id, 'game'); assert.equal(entered.length, 1);
  });
  test('Main menu calls onQuitToMenu, closes the overlay and leaves a fresh navigation history', async () => {
    const calls = []; const { ui } = await paused({ callbacks: { onQuitToMenu: () => calls.push('quit') } });
    buttonByLabel(layer('pause'), 'Main menu').click();
    assert.deepEqual(calls, ['quit']); assert.equal(ui.current.id, 'main-menu'); assert.deepEqual(ui.overlays, []); assert.deepEqual(ui.history, []);
    assert.equal(layer('pause'), null);
  });
  test('onRestart / onQuitToMenu returning false cancel their action', async () => {
    const { ui } = await paused({ callbacks: { onRestart: () => false, onQuitToMenu: () => false } });
    buttonByLabel(layer('pause'), 'Restart').click(); buttonByLabel(layer('pause'), 'Main menu').click();
    assert.deepEqual(ui.overlays, ['pause']); assert.equal(ui.current.id, 'game');
  });
  test('Settings opens above Pause; Escape closes only the settings overlay', async () => {
    const { ui } = await paused();
    const item = buttonByLabel(layer('pause'), 'Settings'); item.focus(); item.click();   // a real click focuses first
    assert.deepEqual(ui.overlays, ['pause', 'settings']);
    press('Escape'); assert.deepEqual(ui.overlays, ['pause']);
    assert.equal(labelOf(document.activeElement), 'Settings');
  });
  test('Tab stays inside the overlay and arrow keys move through the menu', async () => {
    const { ui } = await paused();
    const items = qa('.mp-menu-item', layer('pause')); assert.equal(items.length, 4);
    items[3].focus(); press('Tab'); assert.equal(document.activeElement, items[0], 'Tab from the last item');
    press('Tab', { shiftKey: true }); assert.equal(document.activeElement, items[3], 'Shift+Tab from the first item');
    press('ArrowUp'); assert.equal(document.activeElement, items[2]);
    press('Home'); assert.equal(document.activeElement, items[0]);
    assert.deepEqual(ui.overlays, ['pause']);
  });
  test('while only the gameplay screen is shown the manager leaves its keys alone', async () => {
    const { ui } = build(); await ui.go('game');
    const event = press('Escape', {}, document.body);
    assert.equal(event.defaultPrevented, false); assert.deepEqual(ui.overlays, []); assert.equal(ui.current.id, 'game');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Results screen');

  const WIN = { outcome: 'success', level: 'b', levelName: 'Bravo', score: 97.4, target: 95, stars: 2, nextLevel: 'c' };
  const LOSS = { outcome: 'failure', level: 'b', levelName: 'Bravo', score: 62, target: 95, stars: 3, nextLevel: 'c' };
  const labels = root => qa('.mp-gs-menu button', root).map(labelOf);

  test('normalizeResult: only "success" is success; absent or non-numeric details become null', () => {
    assert.equal(GS.normalizeResult({ outcome: 'success' }).outcome, 'success');
    for (const odd of [undefined, {}, { outcome: 'win' }, { outcome: 'SUCCESS' }, null]) assert.equal(GS.normalizeResult(odd).outcome, 'failure', show(odd));
    const r = GS.normalizeResult({ outcome: 'success', score: '90', target: NaN, stars: Infinity, levelName: '', nextLevel: 0 });
    assert.deepEqual([r.score, r.target, r.stars, r.levelName, r.nextLevel], [null, null, null, null, 0], 'a next level with id 0 is still a next level');
    const f = GS.normalizeResult(LOSS); assert.deepEqual([f.stars, f.nextLevel], [null, null], 'a failure carries no stars or next level');
  });
  test('success: title, MATCH, target, stars, actions, win backdrop, announcement, focus on Next level', async () => {
    const { ui } = build(); await ui.go('results', WIN);
    const el = layer('results');
    assert.equal(el.querySelector('section').dataset.outcome, 'success');
    assert.equal(text(q('h1', el)), 'Puzzle completed'); assert.equal(q('.mp-laurel-title', el).dataset.tone, 'gold');
    assert.equal(text(q('.mp-stat__value', el)), '97%'); assert.match(text(el), /Target 95%/);
    assert.equal(q('.mp-stars', el).getAttribute('aria-label'), '2 of 3 stars');
    assert.equal(text(q('.mp-text-body', el)), 'Bravo');
    assert.deepEqual(labels(el), ['Next level', 'Retry', 'Levels', 'Main menu']);
    assert.equal(ui.backdrop.dataset.variant, 'win'); assert.equal(announced(), 'Puzzle completed');
    assert.equal(document.activeElement, buttonByLabel(el, 'Next level'));
  });
  test('failure: title, MATCH vs needed score, no stars and no Next level, fail backdrop, focus on Retry', async () => {
    const { ui } = build(); await ui.go('results', LOSS);
    const el = layer('results');
    assert.equal(el.querySelector('section').dataset.outcome, 'failure');
    assert.equal(text(q('h1', el)), 'Puzzle failed'); assert.equal(q('.mp-laurel-title', el).dataset.tone, 'fail');
    assert.equal(text(q('.mp-stat__value', el)), '62%'); assert.match(text(el), /Needed 95% to complete/);
    assert.equal(q('.mp-stars', el), null); assert.deepEqual(labels(el), ['Retry', 'Levels', 'Main menu']);
    assert.equal(ui.backdrop.dataset.variant, 'fail'); assert.equal(announced(), 'Puzzle failed');
    assert.equal(document.activeElement, buttonByLabel(el, 'Retry'));
  });
  test('success without a next level: Retry becomes the main action', async () => {
    const { ui } = build(); await ui.go('results', { outcome: 'success', level: 'e', score: 100, stars: 3 });
    assert.deepEqual(labels(layer('results')), ['Retry', 'Levels', 'Main menu']);
    assert.equal(document.activeElement, buttonByLabel(layer('results'), 'Retry'));
  });
  test('missing details are not rendered and never show as undefined / NaN / null; unknown outcome is a failure', async () => {
    const { ui } = build(); await ui.go('results', {});
    const el = layer('results');
    assert.equal(text(q('h1', el)), 'Puzzle failed'); assert.equal(q('.mp-gs-score', el), null);
    assert.equal(/undefined|NaN|null/.test(text(el)), false, text(el));
    assert.deepEqual(labels(el), ['Retry', 'Levels', 'Main menu']);
  });
  test('Retry and Next level call their callbacks with the result params, then start the gameplay screen', async () => {
    const calls = []; const callbacks = { onRetry: p => calls.push(['retry', p.level]), onNextLevel: p => calls.push(['next', p.nextLevel]) };
    const a = build({ callbacks }); await a.ui.go('results', WIN);
    buttonByLabel(layer('results'), 'Retry').click();
    assert.deepEqual(a.ui.current, { id: 'game', params: { level: 'b' } });
    const b = build({ callbacks }); await b.ui.go('results', WIN);
    buttonByLabel(layer('results'), 'Next level').click();
    assert.deepEqual(b.ui.current, { id: 'game', params: { level: 'c' } });
    assert.deepEqual(calls, [['retry', 'b'], ['next', 'c']]);
  });
  test('Retry works from a failure too, and onRetry / onNextLevel can veto', async () => {
    const a = build(); await a.ui.go('results', LOSS); buttonByLabel(layer('results'), 'Retry').click();
    assert.deepEqual(a.ui.current, { id: 'game', params: { level: 'b' } });
    const b = build({ callbacks: { onRetry: () => false, onNextLevel: () => false } });
    await b.ui.go('results', WIN); buttonByLabel(layer('results'), 'Retry').click(); buttonByLabel(layer('results'), 'Next level').click();
    assert.equal(b.ui.current.id, 'results');
  });
  test('Levels goes to level selection; Main menu goes to the main menu with a fresh history and the warm backdrop', async () => {
    const a = build(); await a.ui.go('results', WIN); buttonByLabel(layer('results'), 'Levels').click();
    assert.equal(a.ui.current.id, 'level-select');
    const b = build(); await b.ui.go('results', LOSS); assert.equal(b.ui.backdrop.dataset.variant, 'fail');
    buttonByLabel(layer('results'), 'Main menu').click();
    assert.equal(b.ui.current.id, 'main-menu'); assert.deepEqual(b.ui.history, []); assert.equal(b.ui.backdrop.dataset.variant, 'warm', 'fail backdrop leaked');
  });
  test('results and gameplay are never Back targets', async () => {
    const { ui } = build(); await ui.go('main-menu'); await ui.go('level-select');
    q('[data-level="c"]', layer('level-select')).click();               // game
    await ui.go('results', WIN);
    assert.deepEqual(ui.history.map(e => e.id), ['main-menu', 'level-select']);
    buttonByLabel(layer('results'), 'Levels').click();
    await ui.back(); assert.equal(ui.current.id, 'main-menu');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  group('Whole flow, motion and cleanup');

  test('boot → menu → levels → game → pause → settings → resume → results → next level, with no warnings', async () => {
    const { ui, c, warnings } = build({ minBootMs: 500 });
    await ui.go('boot'); await flush(); c.tick(500); await flush();
    assert.equal(ui.current.id, 'main-menu');
    buttonByLabel(layer('main-menu'), 'Play').click(); assert.equal(ui.current.id, 'level-select');
    q('[data-level="c"]', layer('level-select')).click(); assert.deepEqual(ui.current, { id: 'game', params: { level: 'c' } });
    q('#game-pause').click(); assert.deepEqual(ui.overlays, ['pause']);
    buttonByLabel(layer('pause'), 'Settings').click(); assert.deepEqual(ui.overlays, ['pause', 'settings']);
    buttonByLabel(layer('settings'), 'Close').click(); buttonByLabel(layer('pause'), 'Resume').click();
    assert.deepEqual(ui.overlays, []);
    await ui.go('results', { outcome: 'success', level: 'c', score: 98, target: 95, stars: 3, nextLevel: 'd' });
    buttonByLabel(layer('results'), 'Next level').click();
    assert.deepEqual(ui.current, { id: 'game', params: { level: 'd' } });
    assert.deepEqual(warnings, []);
  });
  test('under reduced motion every navigation completes at once, with one screen in the DOM', async () => {
    const { ui } = build({ managerOptions: { transitionMs: 750, reducedMotion: () => true } });
    await ui.go('main-menu'); buttonByLabel(layer('main-menu'), 'Play').click();
    assert.equal(ui.transitioning, false); assert.equal(qa('.mp-screen').length, 1);
  });
  test('with motion, the outgoing screen is removed when its transition ends, and nothing warns', async () => {
    const { ui, c, warnings } = build({ managerOptions: { transitionMs: 750, reducedMotion: () => false } });
    ui.go('main-menu'); c.tick(750);
    buttonByLabel(layer('main-menu'), 'Play').click();
    assert.equal(qa('.mp-screen').length, 2); c.tick(750); assert.equal(qa('.mp-screen').length, 1); assert.deepEqual(warnings, []);
  });
  test('the Reduce motion setting reaches the stage attribute and, as the manager\'s reducedMotion, the transitions', async () => {
    const settings = GS.createSettingsStore({ reducedMotion: () => false });
    const { ui, screens } = build({ settingsOptions: {}, managerOptions: { transitionMs: 750, reducedMotion: settings.reducedMotion } });
    assert.equal(ui.stage.dataset.mpReduceMotion, 'false');
    // a second set of screens sharing the settings object the manager asks about
    const shared = build({ managerOptions: { transitionMs: 750, reducedMotion: settings.reducedMotion } });
    const wired = GS.createGameScreens(shared.ui, { settings }); live.push(wired.dispose);
    settings.set('reduceMotion', true);
    assert.equal(shared.ui.stage.dataset.mpReduceMotion, 'true');
    shared.ui.go('main-menu'); assert.equal(shared.ui.transitioning, false);
    settings.set('reduceMotion', false); assert.equal(shared.ui.stage.dataset.mpReduceMotion, 'false');
    assert.ok(screens);
  });
  test('a throwing callback is reported through warn and never blocks the navigation', async () => {
    const { ui, warnings } = build({ callbacks: { onSelectLevel: () => { throw new Error('bad hook'); } } }); await ui.go('level-select');
    q('[data-level="a"]', layer('level-select')).click();
    assert.equal(ui.current.id, 'game'); assert.equal(warnings.length, 1); assert.match(String(warnings[0][0]), /onSelectLevel/);
  });
  test('ui.destroy() and dispose() leave nothing behind', async () => {
    const { ui, screens, settings } = build(); await ui.go('main-menu'); await ui.go('settings');
    const stage = ui.stage; screens.dispose(); ui.destroy();
    assert.equal(stage.isConnected, false); assert.equal(qa('.mp-screen').length, 0); assert.equal(settings.listenerCount, 0);
    assert.equal((await ui.go('main-menu')).reason, 'destroyed');
  });

  // ── Runner ─────────────────────────────────────────────────────────────────────────────────────────────
  const results = { passed: 0, failed: 0, skipped: 0, failures: [] };
  for (const t of tests) {
    if (t.group) { log(`\n${t.group}`); continue; }
    if (t.needsLayout && !layout) { results.skipped += 1; log(`  skip  ${t.name} (needs real layout; runs in the browser run)`); continue; }
    try { await Promise.race([t.fn(), new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after 5s (a navigation promise never resolved?)')), 5000))]); results.passed += 1; log(`  ok    ${t.name}`); }
    catch (error) { results.failed += 1; results.failures.push({ name: t.name, message: error.message }); log(`  FAIL  ${t.name}\n        ${error.message}`); }
    while (live.length) { try { live.pop()(); } catch { /* teardown of an already-destroyed manager */ } }
    document.querySelectorAll('.mp-stage').forEach(el => el.remove());
  }
  return results;
}
