// Step 2 demo: proves the screen manager without any gameplay code. These are generic demo screens, NOT the 34 real ones.
// The "game" screen is a stand-in: a persistent, key-passthrough screen with its own window key listener, to show the
// manager never intercepts gameplay keys and never duplicates listeners when the screen is revisited.
import { createScreenManager, h, glassPanel, screenTitle, menuItem, goldButton, iconButton, hudCard, laurelTitle, keyHint, prefersReducedMotion } from './src/ui/index.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = (text, bad = false) => {
  logEl.prepend(h('li', { 'data-bad': bad ? '' : null }, `${new Date().toLocaleTimeString()}  ${text}`));
  while (logEl.children.length > 40) logEl.lastChild.remove();
};
const wire = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v === true ? '' : String(v)); return el; };

const ui = createScreenManager({
  reducedMotion: () => $('c-reduced').checked || prefersReducedMotion(),
  warn: message => log(String(message), true),
});

ui.register([
  { id: 'boot', title: 'Morpheus', to: ['menu'], history: false, backdrop: 'dim',
    create(ctx) {
      const el = h('div', { class: 'demo-center' }, h('h1', { class: 'mp-text-display mp-text-glow' }, 'MORPHEUS'), h('p', { class: 'mp-text-caption' }, 'PRESS ANY KEY'));
      const next = () => ctx.manager.go('menu', {}, { replace: true });
      ctx.listen(el, 'click', next);
      return { el, onKey() { next(); return true; } };
    } },

  { id: 'menu', title: 'Main menu', to: ['play', 'settings'], escape: false,
    create() {
      const el = h('div', { class: 'demo-center' }, h('h1', { class: 'mp-text-display' }, 'MORPHEUS'),
        h('div', { class: 'demo-col' }, wire(menuItem({ label: 'PLAY' }), { go: 'play' }), wire(menuItem({ label: 'SETTINGS' }), { go: 'settings' })));
      return { el, initialFocus: '.mp-menu-item' };
    } },

  { id: 'play', title: 'Play', to: ['game'],
    create() {
      const el = h('div', { class: 'demo-center' }, screenTitle({ text: 'PLAY' }),
        h('div', { class: 'demo-col' },
          wire(goldButton({ label: 'START PUZZLE' }), { go: 'game', params: '{"level":7}' }),
          wire(goldButton({ label: 'BACK', tone: 'quiet', chevron: false }), { back: true })));
      return { el, initialFocus: '.mp-btn' };
    } },

  // One definition, two separate instances: a screen (from the menu) and an overlay (from pause).
  { id: 'settings', title: 'Settings', to: [], presentation: 'both',
    create(ctx) {
      const asOverlay = ctx.presentation === 'overlay';
      const panel = glassPanel({ className: 'demo-col', children: [
        screenTitle({ text: 'SETTINGS', level: 2 }),
        h('p', { class: 'mp-text-body' }, `Shown as: ${ctx.presentation}`),
        h('label', { class: 'mp-text-body' }, 'Volume ', h('input', { type: 'range', min: '0', max: '10', value: '6', id: `vol-${ctx.presentation}` })),
        wire(goldButton({ label: asOverlay ? 'CLOSE' : 'BACK', tone: 'quiet', chevron: false }), asOverlay ? { close: true } : { back: true }),
      ] });
      return { el: h('div', { class: 'demo-center' }, panel), initialFocus: '.mp-btn' };
    } },

  // Gameplay stand-in: persistent (created once), keys passed through untouched, never a back target, no backdrop.
  { id: 'game', title: params => `Puzzle ${params.level ?? ''}`, to: ['pause', 'result'], persistent: true, keys: 'passthrough', history: false, backdrop: false,
    create(ctx) {
      let keysSeen = 0;
      const levelText = h('span', { class: 'mp-text-title' }, 'LEVEL —');
      const keyText = h('span', { class: 'mp-text-body' }, 'Game saw 0 keys');
      ctx.listen(window, 'keydown', event => { keysSeen += 1; keyText.textContent = `Game saw ${keysSeen} keys (last: ${event.key})`; });
      const el = h('div', { class: 'demo-game' },
        h('div', { class: 'demo-hud' }, levelText, iconButton({ iconName: 'pause', label: 'Pause', caption: 'PAUSE', onClick: () => ctx.manager.open('pause') })),
        h('div', { class: 'demo-game__body' }, keyHint({ keys: 'Esc', text: 'is NOT handled by the manager here' }), keyText,
          wire(goldButton({ label: 'COMPLETE PUZZLE' }), { go: 'result' })));
      return { el, enter(params) { levelText.textContent = `LEVEL ${String(params.level ?? '?').padStart(2, '0')}`; } };
    } },

  { id: 'pause', title: 'Paused', to: ['settings', 'menu'], presentation: 'overlay',
    create() {
      const el = h('div', { class: 'demo-center' }, h('h2', { class: 'mp-text-display' }, 'PAUSED'),
        h('div', { class: 'demo-col' },
          wire(menuItem({ label: 'RESUME' }), { close: true }),
          wire(menuItem({ label: 'SETTINGS' }), { open: 'settings' }),
          wire(menuItem({ label: 'MAIN MENU' }), { go: 'menu', reset: true })));
      return { el, initialFocus: '.mp-menu-item' };
    } },

  { id: 'result', title: 'Puzzle completed', to: ['game', 'play'], history: false, backdrop: 'win',
    create() {
      const el = h('div', { class: 'demo-center' }, laurelTitle({ text: 'PUZZLE COMPLETED' }),
        h('div', { class: 'demo-col' },
          wire(goldButton({ label: 'NEXT LEVEL' }), { go: 'game', params: '{"level":8}' }),
          wire(goldButton({ label: 'LEVELS', tone: 'quiet', chevron: false }), { go: 'play' })));
      return { el, initialFocus: '.mp-btn' };
    } },
]);

const problems = ui.validate();
if (problems.length) log(`validate(): ${JSON.stringify(problems)}`, true);

const render = () => {
  const c = ui.current;
  $('i-current').textContent = c ? `${c.id} ${JSON.stringify(c.params)}` : '—';
  $('i-overlays').textContent = ui.overlays.join(' › ') || '—';
  $('i-history').textContent = ui.history.map(e => e.id).join(' › ') || '(empty)';
  $('i-back').textContent = String(ui.canGoBack);
  $('i-busy').textContent = ui.transitioning ? 'running' : 'idle';
};
ui.subscribe(({ current, overlays }) => { log(`→ ${current?.id}${overlays.length ? ` + ${overlays.join(', ')}` : ''}`); render(); setTimeout(render, 800); });

$('b-back').addEventListener('click', () => ui.back().then(r => log(`back(): ${JSON.stringify(r)}`)));
$('b-bad').addEventListener('click', () => ui.go('boot').then(r => log(`go('boot'): ${JSON.stringify(r)}`, !r.ok)));

ui.go('boot').then(render);
window.ui = ui; // handy in the console
