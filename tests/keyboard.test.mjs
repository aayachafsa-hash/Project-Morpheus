import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, press } from './dom-setup.mjs';

const window = setupDom();
const { createInputLayer, INPUT_DEFAULTS, DEFAULT_BINDINGS } = await import('../src/gameplay/RotationInput.js');
const { DUEL_PLAYERS } = await import('../src/gameplay/DuelControls.js');
const canvas = document.querySelector('#stage');
const button = document.querySelector('#pause');
const slider = document.querySelector('#slider');

// createInputLayer listens on window and has no destroy(). The first layer to see a key calls preventDefault(),
// so layers left over from earlier tests would starve later ones: switch each one off when its test ends.
const open = [];
test.afterEach(() => { open.forEach(off => off()); open.length = 0; });

function layer({ bindings = DEFAULT_BINDINGS, enabled = true } = {}) {
  const events = [];
  let on = enabled;
  const off = () => { on = false; };
  open.push(off);
  const input = createInputLayer(canvas, event => events.push(event), { ...INPUT_DEFAULTS }, bindings, { isEnabled: () => on });
  const degrees = () => events.filter(event => event.type === 'Nudge').reduce((sum, event) => sum + event.degrees, 0);
  return { input, events, degrees, off };
}
const hold = (input, seconds, fps) => { for (let t = 0; t < seconds * fps; t++) input.update(1 / fps); };

test('keys work while a button has focus (Pause, Reset, a closed dialog\'s opener)', () => {
  const { events, input } = layer();
  press(window, button, 'KeyW');
  assert.equal(events.filter(event => event.type === 'Nudge').length, 1);
  press(window, button, 'KeyW', 'keyup');
  input.clear();
});
test('Space and Enter still activate a focused button', () => {
  const { events } = layer();
  const space = press(window, button, 'Space');
  const enter = press(window, button, 'Enter');
  assert.equal(events.length, 0);
  assert.equal(space.defaultPrevented, false);
  assert.equal(enter.defaultPrevented, false);
});
test('typing in a form control never rotates the puzzle', () => {
  const { events } = layer();
  press(window, slider, 'KeyW');
  assert.equal(events.length, 0);
});
test('disabled layer (paused, dialog, other mode) ignores keys', () => {
  const { events } = layer({ enabled: false });
  press(window, canvas, 'KeyW');
  assert.equal(events.length, 0);
});

test('a tap turns a small, visible amount', () => {
  const { events, input } = layer();
  press(window, canvas, 'KeyD'); press(window, canvas, 'KeyD', 'keyup');
  assert.deepEqual(events.filter(event => event.type === 'Nudge').map(event => [event.axis, event.degrees]), [['YawRight', 2]]);
  input.clear();
});
test('holding a key for one second turns well over 100 degrees', () => {
  const { input, degrees } = layer();
  press(window, canvas, 'KeyA');
  hold(input, 1, 60);
  press(window, canvas, 'KeyA', 'keyup');
  assert.ok(degrees() > 100 && degrees() < 200, `turned ${degrees().toFixed(1)} deg`);
});
test('turn rate does not depend on frame rate', () => {
  const totals = [30, 60, 144].map(fps => {
    const { input, degrees, off } = layer();
    press(window, canvas, 'KeyW');
    hold(input, 1, fps);
    press(window, canvas, 'KeyW', 'keyup');
    off();
    return degrees();
  });
  assert.ok(Math.max(...totals) - Math.min(...totals) < 3, totals.join(' / '));
});
test('Fine slows a held key to a fifth', () => {
  const normal = layer();
  press(window, canvas, 'KeyW'); hold(normal.input, 1, 60); press(window, canvas, 'KeyW', 'keyup');
  normal.off();
  const fine = layer();
  press(window, canvas, 'ShiftLeft'); press(window, canvas, 'KeyW'); hold(fine.input, 1, 60);
  press(window, canvas, 'KeyW', 'keyup'); press(window, canvas, 'ShiftLeft', 'keyup');
  assert.ok(fine.degrees() > 5, 'fine still turns');
  assert.ok(fine.degrees() < normal.degrees() * .35, `${fine.degrees().toFixed(1)} vs ${normal.degrees().toFixed(1)}`);
});
test('releasing the key stops the turn and ends the gesture', () => {
  const { input, events, degrees } = layer();
  press(window, canvas, 'KeyW'); hold(input, .5, 60); press(window, canvas, 'KeyW', 'keyup');
  const after = degrees();
  hold(input, .5, 60);
  assert.equal(degrees(), after);
  assert.equal(events.at(-1).type, 'EndNudge');
});

test('duel: each player\'s keys only drive that player', () => {
  const [p1, p2] = DUEL_PLAYERS.map(player => layer({ bindings: player.bindings }));
  press(window, canvas, 'KeyW'); press(window, canvas, 'KeyW', 'keyup');
  assert.equal(p1.events.filter(event => event.type === 'Nudge').length, 1);
  assert.equal(p2.events.length, 0);
  press(window, canvas, 'ArrowUp'); press(window, canvas, 'ArrowUp', 'keyup');
  assert.equal(p1.events.filter(event => event.type === 'Nudge').length, 1);
  assert.equal(p2.events.filter(event => event.type === 'Nudge').length, 1);
  press(window, canvas, 'KeyJ'); press(window, canvas, 'KeyJ', 'keyup');
  assert.equal(p2.events.at(-2).axis, 'RollLeft');
});
test('duel: both players can hold keys at the same time', () => {
  const [p1, p2] = DUEL_PLAYERS.map(player => layer({ bindings: player.bindings }));
  press(window, canvas, 'KeyD'); press(window, canvas, 'ArrowLeft');
  for (let i = 0; i < 60; i++) { p1.input.update(1 / 60); p2.input.update(1 / 60); }
  press(window, canvas, 'KeyD', 'keyup'); press(window, canvas, 'ArrowLeft', 'keyup');
  assert.ok(p1.degrees() > 100 && p2.degrees() > 100);
  assert.ok(p1.events.filter(event => event.type === 'Nudge').every(event => event.axis === 'YawRight'));
  assert.ok(p2.events.filter(event => event.type === 'Nudge').every(event => event.axis === 'YawLeft'));
});
test('duel: Left Shift is Fine for player 1 only, Right Shift for player 2 only', () => {
  const [p1, p2] = DUEL_PLAYERS.map(player => layer({ bindings: player.bindings }));
  press(window, canvas, 'ShiftRight');
  assert.ok(p2.events.some(event => event.type === 'Fine' && event.value === true));
  assert.equal(p1.events.length, 0);
  press(window, canvas, 'ShiftRight', 'keyup');
});
test('duel: no key is bound twice across the two players', () => {
  const keys = DUEL_PLAYERS.flatMap(player => Object.values(player.bindings).flat());
  assert.equal(new Set(keys).size, keys.length);
});
