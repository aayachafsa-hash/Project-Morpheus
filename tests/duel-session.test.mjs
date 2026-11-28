import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, press } from './dom-setup.mjs';

const window = setupDom();
const THREE = await import('three');
const { createGameState } = await import('../src/app/GameState.js');
const { createDuelSession, COUNTDOWN_MS, RESULT_DELAY_MS } = await import('../src/app/DuelSession.js');
const { ROUND_TIME_LIMIT_S } = await import('../src/gameplay/DuelRules.js');
const canvas = document.querySelector('#stage');

// A 4x4 wall with a ten-pixel target gives an exact 90% fixture.
const TARGET = Uint8Array.from([1,1,1,1, 1,1,1,1, 1,1,0,0, 0,0,0,0]);
const MASKS = {
  solved: TARGET,
  threshold: Uint8Array.from([1,1,1,1, 1,1,1,1, 1,0,0,0, 0,0,0,0]),
  below: Uint8Array.from([1,1,1,1, 1,1,1,1, 0,0,0,0, 0,0,0,0]),
  half: Uint8Array.from([1,1,1,1, 1,0,0,0, 0,0,0,0, 0,0,0,0]),       // IoU .50
  quarter: Uint8Array.from([1,1,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]),    // IoU .20
  empty: new Uint8Array(16),
};
const levels = ['Aquafish', 'Teapot', 'Horse'].map((name, i) => ({ name, id: name.toLowerCase(), mask256: name, anchor: [0, i, 0], startPose: [0, 0, 0] }));

// Key listeners live on window, so end every session the way the game does when leaving a duel.
const sessions = [];
test.afterEach(() => { sessions.forEach(session => session.exit()); sessions.length = 0; });

function setup({ rounds = 3 } = {}) {
  const flow = createGameState();
  flow.go('mainMenu');
  const log = { rounds: [], summaries: [], errors: [], mode: [], hud: {} };
  const makePiece = () => ({ mesh: new THREE.Mesh(), outline: new THREE.Group(), targetPosition: new THREE.Vector3(), targetRotation: new THREE.Quaternion(), height: 0 });
  const rig = {
    active: false, pieces: { p1: makePiece(), p2: makePiece() }, entered: 0, exited: 0, resets: [], frames: 0, lastFrozen: null,
    camera: () => new THREE.PerspectiveCamera(), invalidate() {},
    enter() { this.active = true; this.entered++; }, setLevel() {}, resetPieces(level) { this.resets.push(level.name); },
    renderFrame(dt, frozen) { this.frames++; this.lastFrozen = frozen; }, exit() { this.active = false; this.exited++; },
  };
  const spotlight = new THREE.Object3D(); spotlight.position.set(0, 0, 10); spotlight.target = new THREE.Object3D();
  const behaviour = { p1: 'empty', p2: 'empty' };
  const view = { duelRig: rig, spotlight, shadowScene: {}, prepareLevel: async () => ({}) };
  const hudCall = name => (...args) => { (log.hud[name] ??= []).push(args); };
  const ui = {
    prepareTarget: async () => ({ width: 4, height: 4 }),
    duelHud: Object.fromEntries(['setRound', 'setScore', 'setMatch', 'setSolved', 'setTimer', 'setBanner', 'setCountdown'].map(name => [name, hudCall(name)])),
    setDuelMode: on => log.mode.push(on), showDuelRound: info => log.rounds.push(info), showDuelSummary: s => log.summaries.push(s), showError: m => log.errors.push(m),
  };
  const settings = { ...(await_import_defaults()) };
  const duel = createDuelSession({
    view, flow, ui, settings, levels, random: () => 0.5, loadMask: async () => TARGET,
    createShadows: ({ piece }) => ({ captureShadowMask: async () => MASKS[behaviour[piece === rig.pieces.p1 ? 'p1' : 'p2']] }),
  });
  sessions.push(duel);
  return { flow, duel, rig, log, behaviour, rounds };
}
let DEFAULTS;
function await_import_defaults() { return DEFAULTS; }
DEFAULTS = (await import('../src/gameplay/RotationInput.js')).INPUT_DEFAULTS;

const tick = () => new Promise(resolve => setImmediate(resolve));
async function run(duel, seconds, fps = 20) { for (let i = 0; i < seconds * fps; i++) { duel.frame(1 / fps, i * 1000 / fps); await tick(); } }
const startMatch = async (ctx, rounds = 3) => { await ctx.duel.start(rounds); ctx.flow.go('playing'); };
const angle = piece => piece.mesh.quaternion.angleTo(new THREE.Quaternion());

test('start loads round 1, shows the HUD and waits in a 3-2-1 countdown', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  assert.equal(ctx.duel.active, true);
  assert.deepEqual(ctx.log.mode, [true]);
  assert.equal(ctx.rig.entered, 1);
  assert.equal(ctx.log.hud.setRound[0][0].total, 3);
  await run(ctx.duel, .5);
  assert.deepEqual(ctx.log.hud.setCountdown.at(-1), ['3']);
  await run(ctx.duel, 1.7);                                    // 2.2s in: 0.8s left
  assert.deepEqual(ctx.log.hud.setCountdown.at(-1), ['1']);
  await run(ctx.duel, 1);
  assert.deepEqual(ctx.log.hud.setCountdown.at(-1), ['Go']);
});

test('keys do nothing during the countdown, then each player only moves their own piece', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  press(window, canvas, 'KeyD'); press(window, canvas, 'ArrowUp');
  assert.equal(angle(ctx.rig.pieces.p1), 0); assert.equal(angle(ctx.rig.pieces.p2), 0);
  press(window, canvas, 'KeyD', 'keyup'); press(window, canvas, 'ArrowUp', 'keyup');
  await run(ctx.duel, COUNTDOWN_MS / 1000 + .5);                // countdown over, round live
  press(window, canvas, 'KeyD');
  await run(ctx.duel, .5);
  press(window, canvas, 'KeyD', 'keyup');
  assert.ok(angle(ctx.rig.pieces.p1) > .3, 'player 1 piece turned');
  assert.equal(angle(ctx.rig.pieces.p2), 0, 'player 2 piece untouched');
  press(window, canvas, 'ArrowLeft');
  await run(ctx.duel, .5);
  press(window, canvas, 'ArrowLeft', 'keyup');
  assert.ok(angle(ctx.rig.pieces.p2) > .3, 'player 2 piece turned');
});

test('first player to hold the solved shadow wins the round and the results appear after a short delay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'solved'; ctx.behaviour.p2 = 'half';
  await run(ctx.duel, 6);
  assert.equal(ctx.flow.state, 'solved');
  assert.deepEqual(ctx.log.rounds, [], 'results dialog waits for the delay');
  t.mock.timers.tick(RESULT_DELAY_MS + 10);
  const [info] = ctx.log.rounds;
  assert.equal(info.record.winner, 'p1');
  assert.deepEqual(info.score, [3, 0]);
  assert.deepEqual(info.outcomes, ['p1']);
  assert.equal(info.over, false);
  assert.ok(info.record.p1.solvedMs > 0 && info.record.p2.solvedMs === null);
  assert.ok(info.record.p2.best >= 50 && info.record.p2.best < 100, `loser best ${info.record.p2.best}`);
});

test('both solving together is a draw that gives each player 1 point', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'solved'; ctx.behaviour.p2 = 'solved';
  await run(ctx.duel, 6);
  t.mock.timers.tick(RESULT_DELAY_MS + 10);
  assert.equal(ctx.log.rounds[0].record.winner, 'draw');
  assert.deepEqual(ctx.log.rounds[0].score, [1, 1]);
});

test('Duel accepts exactly 90% after the hold, and a lower match never solves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'below'; ctx.behaviour.p2 = 'below';
  await run(ctx.duel, 4);
  assert.equal(ctx.flow.state, 'playing');
  assert.deepEqual(ctx.log.hud.setMatch.at(-1), [80, 80]);
  ctx.behaviour.p1 = 'threshold';
  await run(ctx.duel, .4);
  assert.equal(ctx.flow.state, 'playing', 'the smoothed match still needs its hold');
  await run(ctx.duel, 1);
  t.mock.timers.tick(RESULT_DELAY_MS + 10);
  assert.equal(ctx.log.rounds[0].record.winner, 'p1');
  assert.deepEqual(ctx.log.hud.setMatch.at(-1), [90, 80]);
  assert.equal(ctx.log.rounds[0].record.p1.best, 90);
  assert.equal(ctx.log.rounds[0].record.p2.solvedMs, null);
});

test('time out: the closer shadow takes the round', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'quarter'; ctx.behaviour.p2 = 'half';
  await run(ctx.duel, COUNTDOWN_MS / 1000 + ROUND_TIME_LIMIT_S + 2, 10);
  t.mock.timers.tick(RESULT_DELAY_MS + 10);
  const [info] = ctx.log.rounds;
  assert.equal(info.record.timedOut, true);
  assert.equal(info.record.winner, 'p2');
  assert.equal(ctx.log.hud.setTimer.at(-1)[0], 0);
});

test('3 rounds: each round loads a new puzzle, and the summary appears only after the last one', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'solved';
  await run(ctx.duel, 6); t.mock.timers.tick(RESULT_DELAY_MS + 10);
  assert.equal(ctx.log.rounds[0].over, false);
  await ctx.duel.nextRound(); ctx.flow.go('playing');
  assert.equal(ctx.log.hud.setRound.at(-1)[0].number, 2);
  assert.notEqual(ctx.log.hud.setRound[0][0].levelName, ctx.log.hud.setRound.at(-1)[0].levelName, 'different puzzle');
  await run(ctx.duel, 6); t.mock.timers.tick(RESULT_DELAY_MS + 10);
  assert.equal(ctx.log.rounds.at(-1).over, false, 'two wins out of three: the third round is still scheduled');
  await ctx.duel.nextRound(); ctx.flow.go('playing');
  await run(ctx.duel, 6); t.mock.timers.tick(RESULT_DELAY_MS + 10);
  const last = ctx.log.rounds.at(-1);
  assert.equal(last.over, true);
  assert.equal(last.summary.winner, 'p1');
  assert.deepEqual(last.summary.score, [9, 0]);
  assert.equal(last.summary.mode, 'Classic Duel (3 rounds)');
  assert.ok(last.summary.bestTimeMs.p1 > 0 && last.summary.bestTimeMs.p2 === null);
});

test('pausing freezes the countdown, the clock and the keys', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  await run(ctx.duel, COUNTDOWN_MS / 1000 + 1);
  ctx.flow.go('paused'); ctx.flow.open('pause');
  const before = ctx.log.hud.setTimer.at(-1)[0];
  press(window, canvas, 'KeyD');
  await run(ctx.duel, 3);
  press(window, canvas, 'KeyD', 'keyup');
  assert.equal(ctx.log.hud.setTimer.at(-1)[0], before, 'timer frozen');
  assert.equal(angle(ctx.rig.pieces.p1), 0, 'keys ignored while paused');
  assert.equal(ctx.rig.lastFrozen, true, 'atmosphere frozen');
  ctx.flow.close('pause'); ctx.flow.go('playing');
  await run(ctx.duel, 1);
  assert.equal(ctx.rig.lastFrozen, false);
});

test('restart round reloads the same puzzle without scoring the round', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  const name = ctx.log.hud.setRound.at(-1)[0].levelName;
  await run(ctx.duel, 5);
  await ctx.duel.restartRound();
  assert.equal(ctx.log.hud.setRound.at(-1)[0].levelName, name);
  assert.equal(ctx.log.hud.setRound.at(-1)[0].number, 1);
  assert.equal(ctx.log.rounds.length, 0);
});

test('exit leaves the solo game exactly as it was and is safe to call twice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.duel.exit(); ctx.duel.exit();
  assert.equal(ctx.duel.active, false);
  assert.equal(ctx.rig.exited, 1);
  assert.deepEqual(ctx.log.mode, [true, false]);
  const frames = ctx.rig.frames;
  ctx.duel.frame(.05, 0);
  assert.equal(ctx.rig.frames, frames, 'no rendering after exit');
});

test('a failed load cleans up instead of leaving a half-started duel', async () => {
  const ctx = setup();
  ctx.duel = createDuelSession({ view: { duelRig: ctx.rig, prepareLevel: async () => { throw new Error('mesh missing'); }, shadowScene: {}, spotlight: new THREE.Object3D() },
    flow: ctx.flow, ui: { prepareTarget: async () => ({}), duelHud: {}, setDuelMode: on => ctx.log.mode.push(on) }, settings: DEFAULTS, levels, loadMask: async () => TARGET, createShadows: () => ({}) });
  await assert.rejects(ctx.duel.start(3), /mesh missing/);
  assert.equal(ctx.duel.active, false);
  assert.equal(ctx.rig.active, false);
});

test('a round still ends when a scoring sample starts on every frame (slow machine)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ctx = setup(); await startMatch(ctx);
  ctx.behaviour.p1 = 'quarter'; ctx.behaviour.p2 = 'half';
  await run(ctx.duel, COUNTDOWN_MS / 1000 + ROUND_TIME_LIMIT_S + 2, 10);   // dt = 0.1s = one scoring interval
  t.mock.timers.tick(RESULT_DELAY_MS + 10);
  assert.equal(ctx.log.rounds[0]?.record.winner, 'p2');
});
