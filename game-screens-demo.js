// Step 3 demo: every game screen, testable on its own, with no gameplay code.
// "Start at" builds a FRESH screen manager at the chosen screen (the manager only allows the transitions each screen's
// `to` list declares, so a fresh manager is how a screen is reached directly). Everything below the divider is DEMO-ONLY:
// the stand-in `game` screen and the sample level catalogue. The real gameplay screen arrives in Step 4.
import { createScreenManager, h, iconButton, goldButton, keyHint } from './src/ui/index.js';
import { registerGameScreens, createSettingsStore } from './src/ui/game-screens/index.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = (text, bad = false) => {
  logEl.prepend(h('li', { 'data-bad': bad ? '' : null }, `${new Date().toLocaleTimeString()}  ${text}`));
  while (logEl.children.length > 40) logEl.lastChild.remove();
};

// The inspector is demo chrome: start it collapsed unless there is room, so it never covers the screen under test.
if (window.innerWidth < 1500) document.querySelector('.demo-inspector').open = false;

// Settings survive a reload; a blocked localStorage just means they do not persist.
let storage = null;
try { storage = window.localStorage; } catch { /* blocked */ }
const settings = createSettingsStore({ storage, storageKey: 'morpheus.demo.settings' });
settings.subscribe(({ key, value }) => { log(`setting ${key} = ${value}`); if (key === 'reduceMotion') $('reduced').checked = value; });
$('reduced').checked = settings.get('reduceMotion');
$('reduced').addEventListener('change', event => settings.set('reduceMotion', event.target.checked));

// ── DEMO-ONLY data ─────────────────────────────────────────────────────────
const CATALOG = [
  ['aquafish', 'Aquafish', 'fish'], ['crescent', 'Crescent', 'crescent'], ['cone', 'Cone', 'cone'], ['pebble', 'Pebble', 'oval'],
  ['harbour', 'Harbour', 'fish'], ['sickle', 'Sickle', 'crescent'], ['spire', 'Spire', 'cone'], ['stone', 'Stone', 'oval'],
  ['minnow', 'Minnow', 'fish'], ['horn', 'Horn', 'crescent'], ['pyramid', 'Pyramid', 'cone'], ['egg', 'Egg', 'oval'],
].map(([id, name, iconName]) => ({ id, name, iconName }));
const PROGRESS = {
  fresh: { completed: {} },
  mid: { completed: { aquafish: 3, crescent: 2, cone: 1 } },
  all: { completed: Object.fromEntries(CATALOG.map((level, i) => [level.id, (i % 3) + 1])) },
};
const levelById = id => CATALOG.find(level => level.id === id);
const nextAfter = id => CATALOG[CATALOG.findIndex(level => level.id === id) + 1]?.id ?? null;

// Stand-in gameplay screen: persistent, key-passthrough, never a back target, no shared backdrop (same contract as the real one will have).
const demoGame = {
  id: 'game', title: params => `Puzzle ${params.level ?? ''}`, to: ['pause', 'results'], persistent: true, keys: 'passthrough', history: false, backdrop: false,
  create(ctx) {
    let level = null;
    const label = h('span', { class: 'mp-text-title' }, 'LEVEL —');
    const finish = outcome => () => ctx.manager.go('results', outcome === 'success'
      ? { outcome, level, levelName: levelById(level)?.name, score: 97, target: 95, stars: 2, nextLevel: nextAfter(level) }
      : { outcome, level, levelName: levelById(level)?.name, score: 62, target: 95 });
    const el = h('div', { class: 'demo-game' },
      h('div', { class: 'demo-hud' }, label,
        iconButton({ iconName: 'pause', label: 'Pause', caption: 'PAUSE', onClick: () => ctx.manager.open('pause', { levelName: levelById(level)?.name }) })),
      h('div', { class: 'demo-game__body' }, keyHint({ keys: 'Esc', text: 'is not handled by the manager here' }),
        goldButton({ label: 'Complete puzzle', onClick: finish('success') }), goldButton({ label: 'Fail puzzle', tone: 'quiet', chevron: false, onClick: finish('failure') })));
    return { el, enter(params) { level = params.level ?? CATALOG[0].id; label.textContent = `LEVEL ${String(CATALOG.findIndex(l => l.id === level) + 1).padStart(2, '0')}`; } };
  },
};
// ───────────────────────────────────────────────────────────────────────────

let ui = null, screens = null;
const render = () => {
  const c = ui?.current;
  $('i-current').textContent = c ? `${c.id} ${JSON.stringify(c.params)}` : '—';
  $('i-overlays').textContent = ui?.overlays.join(' › ') || '—';
  $('i-history').textContent = ui?.history.map(e => e.id).join(' › ') || '(empty)';
};

const note = name => arg => { log(`callback ${name}(${arg === undefined ? '' : JSON.stringify(arg)})`); };

function start(kind) {
  screens?.dispose(); ui?.destroy();
  ui = createScreenManager({ reducedMotion: settings.reducedMotion, warn: (...args) => log(args.map(String).join(' '), true) });
  screens = registerGameScreens(ui, {
    settings, levels: CATALOG, progress: () => PROGRESS[$('progress').value],
    load: async ({ progress }) => { // pretend to load assets so the progress bar has something to show
      for (const [percent, message] of [[15, 'Lighting the room…'], [45, 'Carving the objects…'], [80, 'Casting shadows…'], [100, 'Ready']]) { progress(percent, message); await new Promise(r => setTimeout(r, 450)); }
    },
    warn: (...args) => log(args.map(String).join(' '), true),
    callbacks: Object.fromEntries(['onBootComplete', 'onBootError', 'onSelectLevel', 'onResume', 'onRestart', 'onQuitToMenu', 'onRetry', 'onNextLevel'].map(name => [name, note(name)])),
  });
  ui.register(demoGame);
  const problems = ui.validate();
  if (problems.length) log(`validate(): ${JSON.stringify(problems)}`, true);
  ui.subscribe(({ current, overlays }) => { log(`→ ${current?.id}${overlays.length ? ` + ${overlays.join(', ')}` : ''}`); render(); setTimeout(render, 800); });

  const first = {
    boot: () => ui.go('boot'),
    menu: () => ui.go('main-menu'),
    levels: () => ui.go('level-select'),
    settings: () => ui.go('settings'),
    pause: () => ui.go('game', { level: 'aquafish' }).then(() => ui.open('pause', { levelName: 'Aquafish' })),
    success: () => ui.go('results', { outcome: 'success', level: 'aquafish', levelName: 'Aquafish', score: 97, target: 95, stars: 2, nextLevel: 'crescent' }),
    failure: () => ui.go('results', { outcome: 'failure', level: 'aquafish', levelName: 'Aquafish', score: 62, target: 95 }),
  }[kind];
  log(`start at "${kind}"`);
  first().then(render);
}

const STARTS = [['boot', 'Boot'], ['menu', 'Main menu'], ['levels', 'Level select'], ['settings', 'Settings'], ['pause', 'Pause (overlay)'], ['success', 'Results: success'], ['failure', 'Results: failure']];
$('starts').append(...STARTS.map(([kind, text]) => h('button', { type: 'button', 'data-start': kind, onClick: () => start(kind) }, text)));
start('boot');
window.ui = () => ui; // handy in the console
