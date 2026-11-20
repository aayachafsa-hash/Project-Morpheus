// Steps 4.1 + 4.2 demo: the gameplay HUD on its own, over a plain stand-in for the 3D viewport.
// Nothing here touches Three.js, main.js or the screen manager. The "stand-in bridge" below is SCRIPTED: it logs the
// callbacks, and Check Shadow plays back an outcome picked in the inspector (a fixed number and state). No match is
// ever computed, and pause / reset / solution do nothing but log.
import { h } from './src/ui/index.js';
import { gameplayHud, MATCH_STATES, CONTROL_HINTS } from './src/ui/gameplay-hud/index.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = text => { logEl.prepend(h('li', {}, `${new Date().toLocaleTimeString()}  ${text}`)); while (logEl.children.length > 30) logEl.lastChild.remove(); };

// The stand-in canvas is a sibling under the HUD: it only hears pointer-downs that the HUD lets through.
let pointerDowns = 0;
$('canvas').addEventListener('pointerdown', () => { pointerDowns++; $('canvas-label').textContent = `3D viewport (stand-in) · pointer-downs: ${pointerDowns}`; });

// Stand-in bridge: what the gameplay side would supply. Each callback only logs; Check Shadow also plays a scripted outcome.
const OUTCOMES = { match: [97, 'match'], close: [78, 'close'], miss: [31, 'miss'] };
const counts = { pause: 0, reset: 0, check: 0, solution: 0 };
let hud;
const act = (name, label) => {
  counts[name]++;
  log(`${label}() #${counts[name]}`);
  if ($('throws').checked) throw new Error(`${label} failed (demo)`);
  if (name === 'check') {
    hud.setMatchState('checking');
    setTimeout(() => { const [value, state] = OUTCOMES[$('outcome').value]; hud.setMatch(value, { state }); log(`HUD <- setMatch(${value}, { state: '${state}' })  (scripted)`); }, 700);
  }
  return $('async').checked ? new Promise(resolve => setTimeout(resolve, 800)) : undefined;
};
const bridge = () => ({ onPause: () => act('pause', 'onPause'), onReset: () => act('reset', 'onReset'), onCheckShadow: () => act('check', 'onCheckShadow'), onShowSolution: () => act('solution', 'onShowSolution') });
const unbound = { onPause: null, onReset: null, onCheckShadow: null, onShowSolution: null };

const viewport = $('viewport');
hud = gameplayHud({ levelNumber: 3, levelName: 'Aquafish', match: 62, matchState: 'close', ...bridge(), onError: (error, name) => log(`onError(${name}): ${error.message}`) });
viewport.append(hud);
window.hud = hud; // handy in the console

$('bind').addEventListener('change', event => { hud.setHandlers(event.target.checked ? bridge() : unbound); log(event.target.checked ? 'setHandlers(bridge)' : 'setHandlers(all null)'); });

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
$('states').append(...MATCH_STATES.map(state => h('button', { type: 'button', onClick: () => hud.setMatchState(state) }, state)));

$('level-number').addEventListener('input', event => hud.setLevel({ number: Number(event.target.value), name: Number(event.target.value) === 3 ? 'Aquafish' : '' }));

$('toggles').append(...Object.keys(hud.buttons).map(name => h('button', {
  type: 'button', 'aria-pressed': 'false',
  onClick: event => { const on = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(on)); hud.setDisabled(name, on); },
}, `disable ${name}`)));

$('hints').addEventListener('click', event => { const on = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(on)); hud.setHintsVisible(on); });
$('active').append(...[null, ...CONTROL_HINTS.map(hint => hint.id)].map(id => h('button', { type: 'button', onClick: () => hud.setActiveControl(id) }, id ?? 'none')));

$('reduced').addEventListener('change', event => { document.body.dataset.mpReduceMotion = String(event.target.checked); });

if (window.innerWidth < 900) document.querySelector('.demo-inspector').open = false;
