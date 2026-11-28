import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './dom-setup.mjs';

const window = setupDom();
// jsdom has no canvas, <dialog> modality or Web Animations: provide just enough for the UI modules.
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
window.Element.prototype.getAnimations = () => [];

const { focusOnHover } = await import('../src/ui/hoverFocus.js');
const { createDialogManager } = await import('../src/ui/DialogManager.js');
const { createGameState } = await import('../src/app/GameState.js');
const { createDuelHud } = await import('../src/ui/DuelHud.js');
const { createDuelScreens } = await import('../src/ui/DuelScreens.js');
const { h } = await import('../src/ui/dom.js');
const { goldButton, menuItem } = await import('../src/ui/index.js');

const over = (element, pointerType = 'mouse') => {
  const event = new window.MouseEvent('pointerover', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  element.dispatchEvent(event);
};
// Pointer leaves `from` for `to` (null = empty space / outside the menu), like the browser's pointerout.
const out = (from, to = null, pointerType = 'mouse') => {
  const event = new window.MouseEvent('pointerout', { bubbles: true, relatedTarget: to });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  from.dispatchEvent(event);
};

test('main menu: the focused first row stops looking hovered when the mouse is on another row', () => {
  const play = goldButton({ label: 'Play' });
  const settings = menuItem({ label: 'Settings' });
  const levels = menuItem({ label: 'Levels' });
  const list = h('div', {}, play, levels, settings);
  document.body.append(list);
  focusOnHover(list);
  play.focus();
  assert.equal(document.activeElement, play);
  over(settings);
  assert.equal(document.activeElement, settings, 'focus (and its highlight) follows the pointer');
  over(levels.querySelector('span') ?? levels);
  assert.equal(document.activeElement, levels, 'works when the pointer is over a child of the row');
  list.remove();
});
function mainMenu() {
  const play = goldButton({ label: 'Play' }), levels = menuItem({ label: 'Levels' }), settings = menuItem({ label: 'Settings' });
  const list = h('div', {}, play, levels, settings);
  document.body.append(list);
  focusOnHover(list, () => play);
  play.focus();
  return { play, levels, settings, list };
}
test('PLAY is the default: hover another row, leave it, PLAY is active again', () => {
  const m = mainMenu();
  over(m.settings);
  assert.equal(document.activeElement, m.settings, 'hovered row is the one active row');
  out(m.settings, null);
  assert.equal(document.activeElement, m.play, 'nothing hovered -> PLAY selected again');
  m.list.remove();
});
test('crossing the gap between rows does not bounce the highlight back to PLAY', () => {
  const m = mainMenu();
  over(m.levels);
  out(m.levels, m.list); // the gap is the list itself
  assert.equal(document.activeElement, m.levels, 'gap keeps the current row');
  over(m.settings);
  assert.equal(document.activeElement, m.settings);
  out(m.settings, m.list);
  out(m.list, null); // now the pointer really leaves the menu
  assert.equal(document.activeElement, m.play, 'leaving the menu returns to PLAY');
  m.list.remove();
});
test('moving straight from one row to another never hands the highlight back to PLAY', () => {
  const m = mainMenu();
  over(m.levels);
  out(m.levels, m.settings); // pointerout fires first, relatedTarget is the next row
  assert.equal(document.activeElement, m.levels, 'still on the old row until pointerover arrives');
  over(m.settings);
  assert.equal(document.activeElement, m.settings);
  out(m.settings, m.settings.querySelector('svg') ?? m.settings.firstChild); // child-to-child inside the same row
  assert.equal(document.activeElement, m.settings, 'moving between children of one row keeps it active');
  m.list.remove();
});
test('keyboard choice is not stolen when the pointer later leaves the row it was resting on', () => {
  const m = mainMenu();
  over(m.levels);
  m.settings.focus(); // arrow keys moved the selection while the mouse sat on Levels
  out(m.levels, null);
  assert.equal(document.activeElement, m.settings);
  m.list.remove();
});
test('leaving a row never steals focus from a non-row control (slider, tab, input)', () => {
  const m = mainMenu();
  const input = h('input', { type: 'range' }); m.list.append(input);
  over(m.levels);
  input.focus();
  out(m.levels, null);
  assert.equal(document.activeElement, input);
  m.list.remove();
});
test('hovering a disabled row counts as hovering nothing: PLAY comes back', () => {
  const play = goldButton({ label: 'Play' }), locked = goldButton({ label: 'Locked', disabled: true }), other = goldButton({ label: 'Other' });
  const list = h('div', {}, play, other, locked); document.body.append(list); focusOnHover(list, () => play);
  play.focus(); over(other); out(other, locked); over(locked);
  assert.equal(document.activeElement, play);
  list.remove();
});
test('touch input does not steal focus', () => {
  const a = goldButton({ label: 'A' }), b = goldButton({ label: 'B' });
  const list = h('div', {}, a, b); document.body.append(list); focusOnHover(list);
  a.focus(); over(b, 'touch');
  assert.equal(document.activeElement, a);
  list.remove();
});
test('disabled rows are skipped', () => {
  const a = goldButton({ label: 'A' }), b = goldButton({ label: 'B', disabled: true });
  const list = h('div', {}, a, b); document.body.append(list); focusOnHover(list);
  a.focus(); over(b);
  assert.equal(document.activeElement, a);
  list.remove();
});
test('dialogs restore their primary button when the pointer leaves a hovered row', () => {
  const flow = createGameState(); flow.go('mainMenu'); flow.go('playing'); flow.go('paused');
  const dialogs = createDialogManager(flow, []);
  const resume = goldButton({ label: 'Resume' }), settings = menuItem({ label: 'Settings' });
  dialogs.open('pause', { heading: h('h2', {}, 'Paused'), primary: resume, menu: true, content: h('div', {}, resume, settings) });
  over(settings); assert.equal(document.activeElement, settings);
  out(settings, null); assert.equal(document.activeElement, resume);
  dialogs.closeAll();
});
test('pause / results dialogs (menu: true) get the same hover behaviour through the dialog manager', () => {
  const flow = createGameState(); flow.go('mainMenu'); flow.go('playing'); flow.go('paused');
  const dialogs = createDialogManager(flow, []);
  const resume = goldButton({ label: 'Resume' }), settings = menuItem({ label: 'Settings' });
  dialogs.open('pause', { heading: h('h2', {}, 'Paused'), primary: resume, menu: true, content: h('div', {}, resume, settings) });
  assert.equal(document.activeElement, resume);
  over(settings);
  assert.equal(document.activeElement, settings);
  dialogs.closeAll();
});

test('duel HUD shows both players, timer, score, countdown and the solved state', () => {
  const layer = h('div'); document.body.append(layer);
  const hud = createDuelHud(layer);
  hud.setVisible(true);
  hud.setRound({ number: 2, total: 5, levelName: 'Teapot', image: { width: 4, height: 4 } });
  hud.setScore([1, 0]); hud.setMatch(82, 68); hud.setTimer(90);
  const text = selector => layer.querySelector(selector).textContent;
  assert.equal(text('.mp-duel__round'), 'Round 2 / 5');
  assert.equal(text('.mp-duel__score'), '1 – 0');
  assert.equal(text('.mp-duel__timer'), '01:30');
  assert.equal(text('.mp-duel__threshold'), '90% to solve');
  assert.equal(text('.mp-hud-card[data-player="p1"] .mp-stat__value'), '82%');
  assert.equal(text('.mp-hud-card[data-player="p2"] .mp-stat__value'), '68%');
  assert.equal(layer.querySelector('.mp-duel__timer').dataset.low, 'false');
  hud.setTimer(10); assert.equal(layer.querySelector('.mp-duel__timer').dataset.low, 'true');
  hud.setCountdown('3'); assert.equal(layer.querySelector('.mp-duel__countdown').hidden, false);
  assert.equal(text('.mp-duel__countdown'), '3');
  hud.setCountdown(null); assert.equal(layer.querySelector('.mp-duel__countdown').hidden, true);
  hud.setSolved(true, false);
  hud.setWinner('p1'); assert.equal(hud.root.dataset.winner, 'p1');
  assert.equal(layer.querySelector('.mp-hud-card[data-player="p1"]').dataset.solved, 'true');
  assert.equal(layer.querySelector('.mp-hud-card[data-player="p2"]').dataset.solved, 'false');
  assert.deepEqual([...layer.querySelectorAll('.mp-duel__hints[data-player="p2"] .mp-key')].map(key => key.textContent),
    ['↑', '↓', '←', '→', 'J', 'L', 'Right Shift']);
  assert.equal(layer.querySelector('.mp-duel').hidden, false);
  hud.setVisible(false); assert.equal(layer.querySelector('.mp-duel').hidden, true);
  assert.equal(hud.root.dataset.winner, undefined);
});

// Dialogs left open by one test must not be seen by the next one.
test.afterEach(() => document.querySelectorAll('dialog').forEach(dialog => dialog.remove()));

function screens() {
  const flow = createGameState(); flow.go('mainMenu');
  const dialogs = createDialogManager(flow, []);
  const calls = [];
  const duel = { start: async n => calls.push(['start', n]), nextRound: async () => calls.push(['nextRound']),
    restartRound: async () => calls.push(['restartRound']), restartMatch: async () => calls.push(['restartMatch']) };
  const change = async (apply, focus) => { await apply(); dialogs.closeAll(); focus?.(); };
  const confirm = (heading, body, label, accept) => { calls.push(['confirm', heading]); accept(); };
  const ui = createDuelScreens({ dialogs, flow, change, confirm, leave: next => calls.push(['leave', next]), canvas: document.querySelector('#stage'),
    getDuel: () => duel, isChanging: () => false });
  const dialog = () => document.querySelector('dialog[open]');
  const click = label => [...dialog().querySelectorAll('button')].find(button => button.textContent.includes(label)).click();
  return { flow, dialogs, calls, ui, dialog, click };
}

test('setup dialog: choose match length, see both players\' keys, start', async () => {
  const s = screens();
  s.ui.openSetup();
  const text = s.dialog().textContent;
  for (const word of ['3 rounds', '5 rounds', '7 rounds', 'Player 1', 'Player 2', 'Left Shift', 'Right Shift', 'Start duel']) assert.ok(text.includes(word), word);
  assert.equal(s.dialog().querySelector('[data-rounds="5"]').getAttribute('aria-pressed'), 'true');
  s.click('7 rounds');
  assert.equal(s.dialog().querySelector('[data-rounds="7"]').getAttribute('aria-pressed'), 'true');
  assert.equal(s.dialog().querySelector('[data-rounds="5"]').getAttribute('aria-pressed'), 'false');
  s.click('Start duel');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.calls[0], ['start', 7]);
  assert.equal(s.flow.state, 'playing');
});
test('setup only opens from the main menu', () => {
  const s = screens(); s.flow.go('playing');
  s.ui.openSetup();
  assert.equal(s.dialog(), null);
});
test('duel pause menu: resume, restart round, controls, main menu (with a confirm)', async () => {
  const s = screens(); s.flow.go('playing');
  s.ui.openPause();
  assert.equal(s.flow.state, 'paused');
  const text = s.dialog().textContent;
  for (const word of ['Resume', 'Restart round', 'Controls', 'Main Menu']) assert.ok(text.includes(word), word);
  s.click('Main Menu');
  assert.deepEqual(s.calls.slice(0, 2), [['confirm', 'Leave the duel?'], ['leave', 'mainMenu']]);
});
test('pause resumes play when closed', () => {
  const s = screens(); s.flow.go('playing');
  s.ui.openPause(); s.click('Resume');
  assert.equal(s.flow.state, 'playing');
});

const record = (winner, p1 = {}, p2 = {}) => ({ level: 'Teapot', winner, timedOut: false,
  p1: { best: 100, solvedMs: 12400, ...p1 }, p2: { best: 86, solvedMs: null, ...p2 } });
test('round results: table matches the reference sheet and Next round continues', async () => {
  const s = screens(); s.flow.go('playing'); s.flow.go('solved');
  s.ui.showRound({ record: record('p1'), score: [7, 1], number: 3, total: 5, over: false,
    outcomes: ['p1', 'draw', 'p1'], summary: null });
  const text = s.dialog().textContent;
  for (const word of ['Player 1', 'Wins the round', 'Round 3 of 5', 'Teapot', 'Solved in 12.4s', 'P2 didn’t finish', '100%', '86%', '+3', 'Next round', 'Enter']) assert.ok(text.includes(word), word);
  const dialog = s.dialog();
  assert.equal(dialog.querySelector('.mp-duel-result__score').textContent, 'P17–P21');
  assert.deepEqual([...dialog.querySelectorAll('.mp-duel-result__pips li')].map(pip => pip.dataset.outcome),
    ['p1', 'draw', 'p1', undefined, undefined]);
  assert.equal(dialog.querySelector('tr[data-winner="true"]').dataset.player, 'p1');
  assert.equal(dialog.querySelector('.mp-duel-result__next .mp-btn__chev'), null);
  s.click('Next round');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.calls[0], ['nextRound']);
});
test('draw round says so and gives each player 1 point', () => {
  const s = screens(); s.flow.go('playing'); s.flow.go('solved');
  s.ui.showRound({ record: record('draw', { solvedMs: 9000 }, { best: 100, solvedMs: 9000 }), score: [0, 0], number: 1, total: 3, over: false, summary: null });
  const text = s.dialog().textContent;
  assert.ok(text.includes('Draw') && text.includes('same time'));
  assert.ok(text.includes('+1') && !text.includes('+3'));
});
test('last round opens the styled match summary with score, round outcomes, and statistics', () => {
  const s = screens(); s.flow.go('playing'); s.flow.go('solved');
  const outcomes = ['p1', 'p2', 'p1', 'p2', 'p1'];
  const summary = { mode: 'Classic Duel (5 rounds)', winner: 'p1', score: [9, 6], roundsPlayed: 5, draws: 0,
    averageMatch: { p1: 93, p2: 87 }, bestTimeMs: { p1: 18000, p2: 21000 }, roundsWon: { p1: 3, p2: 2 } };
  s.ui.showRound({ record: record('p1'), score: summary.score, number: 5, total: 5, over: true, outcomes, summary });
  assert.equal(s.dialog().querySelector('.mp-duel-result__headline').textContent, 'Final round');
  s.click('See final result');
  const dialog = s.dialog();
  assert.ok(dialog.classList.contains('mp-duel-result'));
  assert.equal(dialog.querySelector('.mp-duel-result__headline').textContent, 'Player 1');
  assert.equal(dialog.querySelector('.mp-duel-result__score').textContent, 'P19–P26');
  assert.deepEqual([...dialog.querySelectorAll('.mp-duel-result__pips li')].map(pip => pip.dataset.outcome), outcomes);
  assert.equal(dialog.querySelector('tr[data-winner="true"]').dataset.player, 'p1');
  for (const word of ['Wins the match', 'Classic Duel (5 rounds)', '93%', '87%', '00:18', '00:21', 'Rounds won', 'Play again', 'Enter', 'Main menu']) assert.ok(dialog.textContent.includes(word), word);
  assert.equal(document.querySelectorAll('dialog[open]').length, 1, 'round dialog was replaced, not stacked');
});
test('Escape cannot dismiss a round result or the summary', () => {
  const s = screens(); s.flow.go('playing'); s.flow.go('solved');
  s.ui.showRound({ record: record('p2'), score: [0, 1], number: 1, total: 3, over: false, summary: null });
  s.dialog().dispatchEvent(new window.Event('cancel', { cancelable: true }));
  assert.ok(s.dialog(), 'still open');
});

test('every dialog follows the pointer, not just menu: true ones; arrows stay opt-in and yield to handled keys', () => {
  const flow = createGameState(); flow.go('mainMenu');
  const dialogs = createDialogManager(flow, []);
  const back = goldButton({ label: 'Back' }), start = goldButton({ label: 'Start' });
  const dialog = dialogs.open('duel-setup', { heading: h('h2', {}, 'Setup'), primary: start, content: h('div', {}, start, back) });
  over(back);
  assert.equal(document.activeElement, back, 'non-menu dialogs get the same hover highlight');
  const key = new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  back.dispatchEvent(key);
  assert.equal(document.activeElement, back, 'arrow navigation is only on for menu: true dialogs');
  dialogs.closeAll();
  void dialog;
});
