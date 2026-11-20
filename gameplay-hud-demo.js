// Step 4.1 demo: the gameplay HUD on its own, over a plain stand-in for the 3D viewport.
// Nothing here touches Three.js, main.js or the screen manager. The inspector only feeds DISPLAY values into the
// HUD (a number, a presentation state); no match is ever computed, and the buttons only write to the log.
import { h } from './src/ui/index.js';
import { gameplayHud, MATCH_STATES, CONTROL_HINTS } from './src/ui/gameplay-hud/index.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = text => { logEl.prepend(h('li', {}, `${new Date().toLocaleTimeString()}  ${text}`)); while (logEl.children.length > 30) logEl.lastChild.remove(); };

const viewport = $('viewport');
const hud = gameplayHud({
  levelNumber: 3, levelName: 'Aquafish', match: 62, matchState: 'close',
  onPause: () => log('onPause()'), onReset: () => log('onReset()'),
  onCheckShadow: () => log('onCheckShadow()'), onShowSolution: () => log('onShowSolution()'),
});
viewport.append(hud);
window.hud = hud; // handy in the console

// Frame presets: the viewport box is resized, the HUD reacts to the size of that box.
const FRAMES = [['full', 'Full'], ['desktop', '1280×720'], ['tablet', 'Tablet 820×1180'], ['phone', 'Phone 390×760'], ['landscape', 'Phone landscape 844×390']];
const SIZES = { desktop: [1280, 720], tablet: [820, 1180], phone: [390, 760], landscape: [844, 390] };
const setFrame = id => {
  viewport.dataset.frame = id;
  const [w, hgt] = SIZES[id] ?? [null, null];
  viewport.style.width = w ? `min(${w}px, 100%)` : '100%';
  viewport.style.height = hgt ? `min(${hgt}px, 100%)` : '100%';
  for (const b of $('frames').children) b.setAttribute('aria-pressed', String(b.dataset.frame === id));
};
$('frames').append(...FRAMES.map(([id, text]) => h('button', { type: 'button', 'data-frame': id, onClick: () => setFrame(id) }, text)));
setFrame('full');

const push = (extra = {}) => hud.setMatch(Number($('match').value), extra);
$('match').addEventListener('input', () => { $('match-out').textContent = `${$('match').value}%`; push(); });
$('match-clear').addEventListener('click', () => { hud.setMatch(null, { state: 'idle' }); $('match-out').textContent = '—'; });
$('states').append(...MATCH_STATES.map(state => h('button', { type: 'button', onClick: () => push({ state }) }, state)));

$('level-number').addEventListener('input', event => hud.setLevel({ number: Number(event.target.value), name: Number(event.target.value) === 3 ? 'Aquafish' : '' }));

$('toggles').append(...Object.keys(hud.buttons).map(name => h('button', {
  type: 'button', 'aria-pressed': 'false',
  onClick: event => { const on = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(on)); hud.setDisabled(name, on); },
}, `disable ${name}`)));

$('hints').addEventListener('click', event => { const on = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(on)); hud.setHintsVisible(on); });
$('active').append(...[null, ...CONTROL_HINTS.map(hint => hint.id)].map(id => h('button', { type: 'button', onClick: () => hud.setActiveControl(id) }, id ?? 'none')));

$('reduced').addEventListener('change', event => { document.body.dataset.mpReduceMotion = String(event.target.checked); });

if (window.innerWidth < 900) document.querySelector('.demo-inspector').open = false;
