import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Build the real page structure (no scripts run), then the real screens on top of it.
const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' });
const { window } = dom;
Object.assign(globalThis, { window, document: window.document, addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) });
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
window.Element.prototype.getAnimations = () => [];
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.matchMedia = window.matchMedia;
document.body.classList.remove('is-loading');

const { createGameState } = await import('../src/app/GameState.js');
const { createGameScreens } = await import('../src/ui/GameScreens.js');
// Importing these proves every import name in the wiring resolves (ES modules fail at link time otherwise).
await import('../src/app/GameSession.js');
await import('../src/ui/GameHUD.js');
await import('../src/scene/SceneManager.js');
await import('../src/scene/DuelRig.js');

const $ = selector => document.querySelector(selector);
const flow = createGameState();
const canvas = document.createElement('canvas'); $('#stage').append(canvas);
const screens = createGameScreens(flow, canvas, $('.mp-game-layer'), $('.mp-main-menu'));
const duel = { active: false, start: async () => {}, restartRound: async () => {} };
screens.bind({ duel, progress: { resume: () => ({}) }, activeLevel: () => ({}), hasMoves: () => false, reset() {}, cancelCapture() {} });
screens.ready();
const rows = () => [...$('.mp-main-menu__content').querySelectorAll('button')];
const over = element => { const event = new window.MouseEvent('pointerover', { bubbles: true }); Object.defineProperty(event, 'pointerType', { value: 'mouse' }); element.dispatchEvent(event); };
const label = button => button.textContent.trim();
const openDialog = () => document.querySelector('dialog[open]');

test('main menu lists Play, Duel, Levels, Settings, Credits', () => {
  assert.deepEqual(rows().map(label), ['Play', 'Duel', 'Levels', 'Settings', 'Credits']);
});
test('Play starts focused (keyboard ready), and the highlight moves to whichever row the mouse is on', () => {
  const [play, , , settings] = rows();
  assert.equal(document.activeElement, play);
  over(settings);
  assert.equal(document.activeElement, settings);
  assert.notEqual(document.activeElement, play);
  over(play);
  assert.equal(document.activeElement, play);
});
test('Duel opens the setup dialog', () => {
  rows().find(button => label(button) === 'Duel').click();
  assert.ok(openDialog().textContent.includes('Multiplayer Duel'));
  assert.ok(openDialog().textContent.includes('Start duel'));
  [...openDialog().querySelectorAll('button')].find(button => label(button) === 'Back').click();
  assert.equal(openDialog(), null);
});
test('Credits highlights the studio and keeps asset details behind a disclosure', () => {
  const trigger = rows().find(button => label(button) === 'Credits');
  trigger.focus();
  trigger.click();
  const dialog = openDialog();
  assert.equal(dialog.querySelector('.mp-credits__wordmark').textContent, 'Morpheus');
  assert.equal(dialog.querySelector('.mp-credits__studio strong').textContent, 'ENSAM Studios');
  assert.ok(dialog.querySelector('.mp-credits__source').textContent.includes('Triada Studio'));
  assert.equal(dialog.querySelector('.mp-credits__details').open, false);
  assert.equal(dialog.querySelector('.gallery-link').target, '_blank');
  assert.equal(document.activeElement.textContent, 'Back to menu');
  document.activeElement.click();
  assert.equal(openDialog(), null);
  assert.equal(document.activeElement, trigger);
});
test('pause shows the duel menu while a duel is on screen and the solo menu otherwise', () => {
  flow.go('playing');
  duel.active = true;
  screens.togglePause();
  assert.ok(openDialog().textContent.includes('Restart round'));
  assert.ok(!openDialog().textContent.includes('Restart puzzle'));
  [...openDialog().querySelectorAll('button')].find(button => label(button).includes('Resume')).click();
  assert.equal(flow.state, 'playing');
  duel.active = false;
  screens.togglePause();
  assert.ok(openDialog().textContent.includes('Restart puzzle'));
});
