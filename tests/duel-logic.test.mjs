// Run from a folder that contains src/ (with config.js and LevelManager.js) and three:
//   node tests/duel-logic.test.mjs
// Covers the pure logic only. It does NOT test rendering, shadows or the scene.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoundState } from '../src/gameplay/RoundState.js';
import { createInputManager } from '../src/gameplay/InputManager.js';
import { createPlayerController } from '../src/gameplay/PlayerController.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }

// ---------- RoundState ----------
const config = { countdown: 3, threshold: 90, holdTime: 0.5, tie: 'replay' };
function playing(extra = {}) {
  const r = createRoundState({ ...config, ...extra });
  r.start();
  r.update(3.01, [0, 0]);
  return r;
}

test('countdown blocks input, then both players are released together', () => {
  const r = createRoundState(config);
  r.start();
  assert.equal(r.isInputEnabled(), false);
  r.update(1, [100, 100]);
  assert.equal(r.getState().phase, 'countdown');
  r.update(2.1, [100, 100]);
  assert.equal(r.getState().phase, 'playing');
  assert.equal(r.isInputEnabled(), true);
  assert.deepEqual(r.getState().holds, [0, 0]);
});

test('scores during the countdown never count', () => {
  const r = createRoundState(config);
  r.start();
  r.update(2.9, [100, 100]);
  r.update(0.2, [100, 100]); // switches to playing, no hold accumulated
  assert.equal(r.getState().phase, 'playing');
});

test('a sustained match resolves exactly one round', () => {
  const r = playing();
  for (let i = 0; i < 10; i++) r.update(0.1, [95, 40]);
  const s = r.getState();
  assert.equal(s.phase, 'resolved');
  assert.deepEqual(s.result.winners, [0]);
  const before = JSON.stringify(s);
  for (let i = 0; i < 20; i++) r.update(0.1, [95, 99]); // late updates must change nothing
  assert.equal(JSON.stringify(r.getState()), before);
});

test('hold timer restarts when the score drops below the threshold', () => {
  const r = playing();
  r.update(0.4, [95, 0]);
  r.update(0.1, [89.9, 0]);
  assert.equal(r.getState().holds[0], 0);
  r.update(0.4, [95, 0]);
  assert.equal(r.getState().phase, 'playing'); // 0.4 < 0.5, not resolved
});

test('timers are independent per player', () => {
  const r = playing();
  r.update(0.3, [95, 0]);
  r.update(0.1, [95, 95]);
  const { holds } = r.getState();
  assert.ok(Math.abs(holds[0] - 0.4) < 1e-9 && Math.abs(holds[1] - 0.1) < 1e-9);
});

test('tie rules: replay / higherScore / both', () => {
  let r = playing({ tie: 'replay' });
  r.update(0.5, [95, 96]);
  assert.deepEqual(r.getState().result, { winners: [], tie: true, replay: true });
  r = playing({ tie: 'higherScore' });
  r.update(0.5, [95, 96]);
  assert.deepEqual(r.getState().result.winners, [1]);
  r = playing({ tie: 'both' });
  r.update(0.5, [95, 96]);
  assert.deepEqual(r.getState().result.winners, [0, 1]);
});

test('reset and replay carry no timer or result over', () => {
  const r = playing();
  r.update(0.3, [95, 95]);
  r.reset();
  const s = r.getState();
  assert.equal(s.phase, 'idle');
  assert.deepEqual(s.holds, [0, 0]);
  assert.equal(s.result, null);
  r.start();
  assert.equal(r.getState().phase, 'countdown');
  assert.deepEqual(r.getState().holds, [0, 0]);
});

test('start() is ignored while a round is running', () => {
  const r = playing();
  assert.equal(r.start(), false);
  assert.equal(r.getState().phase, 'playing');
});

test('pause freezes the countdown and the hold timers', () => {
  const r = playing();
  r.update(0.3, [95, 0]);
  r.setPaused(true);
  r.update(5, [95, 0]);
  assert.ok(Math.abs(r.getState().holds[0] - 0.3) < 1e-9);
  assert.equal(r.isInputEnabled(), false);
});

// ---------- InputManager ----------
const bindings = {
  p1: { left: 'KeyA', right: 'KeyD', forward: 'KeyW', back: 'KeyS', up: 'KeyR', down: 'KeyF',
        rotateLeft: 'KeyQ', rotateRight: 'KeyE', precision: 'ShiftLeft', cycleAxis: 'KeyT', switchObject: 'Tab' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', forward: 'ArrowUp', back: 'ArrowDown', up: 'KeyI', down: 'KeyK',
        rotateLeft: 'KeyJ', rotateRight: 'KeyL', precision: 'ShiftRight', cycleAxis: 'KeyO', switchObject: 'Enter' },
};
function key(target, type, code, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  target.dispatchEvent(event);
  return event;
}
function manager() {
  const target = new EventTarget();
  return { target, input: createInputManager({ bindings, target, doc: null }) };
}

test('two players hold keys at the same time without interfering', () => {
  const { target, input } = manager();
  input.setEnabled(true);
  key(target, 'keydown', 'KeyD');
  key(target, 'keydown', 'ArrowLeft');
  key(target, 'keydown', 'ShiftRight');
  assert.deepEqual(input.getAxes(0), { x: 1, z: 0, y: 0, turn: 0, precision: false });
  assert.deepEqual(input.getAxes(1), { x: -1, z: 0, y: 0, turn: 0, precision: true });
  key(target, 'keyup', 'KeyD');
  assert.equal(input.getAxes(0).x, 0);
  assert.equal(input.getAxes(1).x, -1);
});

test('left and right Shift are separate players', () => {
  const { target, input } = manager();
  input.setEnabled(true);
  key(target, 'keydown', 'ShiftLeft');
  assert.equal(input.getAxes(0).precision, true);
  assert.equal(input.getAxes(1).precision, false);
});

test('one-shot actions fire once per press, not on auto-repeat', () => {
  const { target, input } = manager();
  input.setEnabled(true);
  key(target, 'keydown', 'KeyT');
  key(target, 'keydown', 'KeyT', { repeat: true });
  key(target, 'keydown', 'KeyT', { repeat: true });
  assert.deepEqual(input.consumeActions(0), ['cycleAxis']);
  assert.deepEqual(input.consumeActions(0), []);
});

test('default browser behaviour is blocked only while enabled', () => {
  const { target, input } = manager();
  assert.equal(key(target, 'keydown', 'Tab').defaultPrevented, false);
  input.setEnabled(true);
  assert.equal(key(target, 'keydown', 'Tab').defaultPrevented, true);
  assert.equal(key(target, 'keydown', 'KeyZ').defaultPrevented, false); // unbound key
  input.setEnabled(false);
  assert.equal(key(target, 'keydown', 'ArrowUp').defaultPrevented, false);
});

test('blur and disabling clear held keys and queued actions', () => {
  const { target, input } = manager();
  input.setEnabled(true);
  key(target, 'keydown', 'KeyW');
  key(target, 'keydown', 'KeyO');
  target.dispatchEvent(new Event('blur'));
  assert.equal(input.getAxes(0).z, 0);
  assert.deepEqual(input.consumeActions(1), []);
  key(target, 'keydown', 'KeyW');
  input.setEnabled(false);
  input.setEnabled(true);
  assert.equal(input.getAxes(0).z, 0);
});

test('keys pressed while disabled are not counted when input is enabled later', () => {
  const { target, input } = manager();
  key(target, 'keydown', 'KeyD');
  input.setEnabled(true);
  assert.equal(input.getAxes(0).x, 0);
});

test('Ctrl/Alt/Meta combinations are ignored', () => {
  const { target, input } = manager();
  input.setEnabled(true);
  key(target, 'keydown', 'KeyD', { ctrlKey: true });
  assert.equal(input.getAxes(0).x, 0);
});

test('a key bound twice is rejected', () => {
  assert.throws(() => createInputManager({
    bindings: { p1: { left: 'KeyA' }, p2: { left: 'KeyA' } }, target: new EventTarget(), doc: null,
  }), /bound twice/);
});

// ---------- PlayerController ----------
function fakePiece() {
  const mesh = new THREE.Object3D();
  return {
    mesh, height: 0,
    targetPosition: new THREE.Vector3(), targetRotation: new THREE.Quaternion(),
    platform: { center: new THREE.Vector3(0, 0, 0), y: 0 },
    movement: { constrain() {}, groundHeight: (_q, h) => h },
  };
}

test('equal inputs on two controllers give equal poses', () => {
  const [pa, pb] = [fakePiece(), fakePiece()];
  const [ca, cb] = [createPlayerController(pa), createPlayerController(pb)];
  ca.reset(); cb.reset();
  const axes = { x: 1, y: 0, z: -1, turn: 1, precision: false };
  for (let i = 0; i < 60; i++) { ca.applyInput(axes, 1 / 60); cb.applyInput(axes, 1 / 60); ca.settle(1 / 60); cb.settle(1 / 60); }
  assert.ok(pa.mesh.position.distanceTo(pb.mesh.position) < 1e-12);
  assert.ok(pa.mesh.quaternion.equals(pb.mesh.quaternion));
});

test('moving one controller leaves the other piece untouched', () => {
  const [pa, pb] = [fakePiece(), fakePiece()];
  const [ca, cb] = [createPlayerController(pa), createPlayerController(pb)];
  ca.reset(); cb.reset();
  const rest = pb.mesh.position.clone();
  const restQ = pb.mesh.quaternion.clone();
  for (let i = 0; i < 60; i++) { ca.applyInput({ x: 1, y: 1, z: 0, turn: 1, precision: false }, 1 / 60); ca.settle(1 / 60); cb.settle(1 / 60); }
  assert.ok(pa.mesh.position.distanceTo(rest) > 0.5);
  assert.equal(pb.mesh.position.distanceTo(rest), 0);
  assert.ok(pb.mesh.quaternion.equals(restQ));
});

test('precision key slows movement to 35%', () => {
  const [pa, pb] = [fakePiece(), fakePiece()];
  const [ca, cb] = [createPlayerController(pa), createPlayerController(pb)];
  ca.reset(); cb.reset();
  const x0 = pa.targetPosition.x;
  ca.applyInput({ x: 1, y: 0, z: 0, turn: 0, precision: false }, 0.1);
  cb.applyInput({ x: 1, y: 0, z: 0, turn: 0, precision: true }, 0.1);
  const full = pa.targetPosition.x - x0, slow = pb.targetPosition.x - x0;
  assert.ok(Math.abs(slow / full - 0.35) < 1e-9);
});

test('reset restores the starting pose and the rotation axis', () => {
  const piece = fakePiece();
  const c = createPlayerController(piece);
  c.reset();
  const start = piece.mesh.position.clone();
  c.cycleAxis();
  assert.equal(c.axisName, 'X');
  for (let i = 0; i < 30; i++) { c.applyInput({ x: 1, y: 0, z: 1, turn: 1, precision: false }, 1 / 60); c.settle(1 / 60); }
  c.reset();
  assert.equal(c.axisName, 'Y');
  assert.equal(piece.mesh.position.distanceTo(start), 0);
});

test('settle reports changed only while the mesh is moving', () => {
  const piece = fakePiece();
  const c = createPlayerController(piece);
  c.reset();
  assert.equal(c.settle(1 / 60).changed, false);
  c.applyInput({ x: 1, y: 0, z: 0, turn: 0, precision: false }, 0.1);
  assert.equal(c.settle(1 / 60).changed, true);
});

console.log(`\n${passed} tests passed`);
