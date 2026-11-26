// node tests/score-manager.test.mjs   (from a folder that contains src/gameplay/ScoreManager.js)
import assert from 'node:assert/strict';
import { createScoreManager } from '../src/gameplay/ScoreManager.js';
import { createRoundState } from '../src/gameplay/RoundState.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }

const win = player => ({ winners: [player], tie: false, replay: false });
const replay = { winners: [], tie: true, replay: true };
const both = { winners: [0, 1], tie: true, replay: false };

// ---------- Classic (win 3 / draw 1 / lose 0) ----------
test('classic: round win gives 3 points, the loser gets 0', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(win(0));
  const s = m.getState();
  assert.deepEqual(s.scores, [3, 0]);
  assert.deepEqual(s.wins, [1, 0]);
  assert.deepEqual(s.losses, [0, 1]);
});

test('classic: a tied round gives each player 1 point', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(both);
  const s = m.getState();
  assert.deepEqual(s.scores, [1, 1]);
  assert.deepEqual(s.draws, [1, 1]);
  assert.deepEqual(s.wins, [0, 0]);
});

test('classic: all scheduled rounds are played, then the higher total wins', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(win(0));
  m.recordRound(win(0));
  assert.equal(m.getState().over, false); // 6-0 but the 3rd round is still scheduled
  m.recordRound(win(1));
  const s = m.getState();
  assert.equal(s.over, true);
  assert.equal(s.matchWinner, 0);
  assert.deepEqual(s.scores, [6, 3]);
  assert.equal(s.roundsPlayed, 3);
});

test('classic: scores never go negative, whatever happens', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 7 });
  for (const r of [win(0), win(1), both, win(1), win(0), both, win(1)]) {
    m.recordRound(r);
    assert.ok(m.getState().scores.every(v => v >= 0));
  }
});

test('classic: 5 and 7 rounds are accepted, other values rejected', () => {
  assert.doesNotThrow(() => createScoreManager({ mode: 'classic', rounds: 5 }));
  assert.doesNotThrow(() => createScoreManager({ mode: 'classic', rounds: 7 }));
  assert.throws(() => createScoreManager({ mode: 'classic', rounds: 4 }), /3, 5 or 7/);
});

test('classic: a replay round does not use up a scheduled round', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  assert.equal(m.recordRound(replay), false);
  assert.equal(m.getState().roundsPlayed, 0);
  m.recordRound(win(1)); m.recordRound(win(1)); m.recordRound(win(0));
  assert.equal(m.getState().matchWinner, 1);
});

test('classic: equal total after the scheduled rounds is a draw (team rule)', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3, drawRule: 'draw' });
  m.recordRound(win(0)); m.recordRound(win(1)); m.recordRound(both); // 4-4
  const s = m.getState();
  assert.equal(s.over, true);
  assert.equal(s.draw, true);
  assert.equal(s.matchWinner, null);
});

test('classic: 1 win + 2 draws beats 3 draws', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(win(0)); m.recordRound(both); m.recordRound(both); // 5-2
  assert.equal(m.getState().matchWinner, 0);
});

test('classic: drawRule "suddenDeath" keeps playing until someone leads', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3, drawRule: 'suddenDeath' });
  m.recordRound(win(0)); m.recordRound(win(1)); m.recordRound(both); // 4-4 after 3 rounds
  assert.equal(m.getState().over, false);
  m.recordRound(both); // 5-5, still tied
  assert.equal(m.getState().over, false);
  m.recordRound(win(1)); // 5-8
  const s = m.getState();
  assert.equal(s.over, true);
  assert.equal(s.matchWinner, 1);
  assert.equal(s.roundsPlayed, 5);
});

test('classic: custom point values are respected', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3, points: { win: 2, draw: 1, lose: 0 } });
  m.recordRound(win(1)); m.recordRound(both);
  assert.deepEqual(m.getState().scores, [1, 3]);
});

// ---------- Survival ----------
test('survival: a round win takes one point from the opponent', () => {
  const m = createScoreManager({ mode: 'survival', startingPoints: 3 });
  m.recordRound(win(0));
  assert.deepEqual(m.getState().points, [3, 2]);
  m.recordRound(win(1));
  assert.deepEqual(m.getState().points, [2, 2]);
});

test('survival: the match ends when a player reaches zero', () => {
  const m = createScoreManager({ mode: 'survival', startingPoints: 2 });
  m.recordRound(win(0));
  assert.equal(m.getState().over, false);
  m.recordRound(win(0));
  const s = m.getState();
  assert.equal(s.over, true);
  assert.equal(s.matchWinner, 0);
  assert.deepEqual(s.points, [2, 0]);
});

test('survival: both players reaching zero in the same round is a draw', () => {
  const m = createScoreManager({ mode: 'survival', startingPoints: 1 });
  m.recordRound(both);
  const s = m.getState();
  assert.equal(s.over, true);
  assert.equal(s.draw, true);
  assert.deepEqual(s.points, [0, 0]);
});

test('survival: replay rounds change nothing', () => {
  const m = createScoreManager({ mode: 'survival', startingPoints: 3 });
  m.recordRound(replay);
  assert.deepEqual(m.getState().points, [3, 3]);
  assert.equal(m.getState().roundsPlayed, 0);
});

// ---------- Both modes ----------
test('the same roundId is never counted twice', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  assert.equal(m.recordRound(win(0), 7), true);
  assert.equal(m.recordRound(win(0), 7), false);
  assert.deepEqual(m.getState().scores, [3, 0]);
});

test('nothing is recorded after the match is over', () => {
  const m = createScoreManager({ mode: 'survival', startingPoints: 1 });
  m.recordRound(win(0));
  const before = JSON.stringify(m.getState());
  assert.equal(m.recordRound(win(1)), false);
  assert.equal(JSON.stringify(m.getState()), before);
});

test('reset starts a clean match (tally, points, history, recorded ids)', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(win(0), 1); m.recordRound(win(0), 2); m.recordRound(win(0), 3);
  assert.equal(m.getState().over, true);
  m.reset();
  const s = m.getState();
  assert.equal(s.over, false);
  assert.deepEqual(s.scores, [0, 0]);
  assert.deepEqual(s.wins, [0, 0]);
  assert.equal(s.roundsPlayed, 0);
  assert.deepEqual(s.history, []);
  assert.equal(m.recordRound(win(1), 1), true); // id 1 can be used again in the new match
});

test('getState returns copies, so callers cannot change the score', () => {
  const m = createScoreManager({ mode: 'classic', rounds: 3 });
  m.recordRound(win(0));
  const s = m.getState();
  s.scores[0] = 99;
  s.history[0].push(1);
  assert.deepEqual(m.getState().scores, [3, 0]);
  assert.deepEqual(m.getState().history, [[0]]);
});

test('invalid configuration is rejected', () => {
  assert.throws(() => createScoreManager({ mode: 'blitz' }), /Unknown match mode/);
  assert.throws(() => createScoreManager({ mode: 'survival', startingPoints: 0 }), /positive integer/);
  assert.throws(() => createScoreManager({ drawRule: 'coin' }), /drawRule/);
  assert.throws(() => createScoreManager({ points: { win: 3, draw: -1, lose: 0 } }), /never go negative/);
});

// ---------- RoundState + ScoreManager together (team settings) ----------
test('team settings: simultaneous finish (tie "both") gives 1 point each, a normal win gives 3', () => {
  const match = createScoreManager({ mode: 'classic', rounds: 3, drawRule: 'draw', points: { win: 3, draw: 1, lose: 0 } });
  const round = createRoundState({ countdown: 3, threshold: 90, holdTime: 0.3, tie: 'both' }); // one instance, like the game
  const play = scores => {
    round.start();
    round.update(3.01, [0, 0]);
    for (let i = 0; i < 4; i++) round.update(0.1, scores);
    const state = round.getState();
    assert.equal(state.phase, 'resolved');
    return match.recordRound(state.result, state.roundId);
  };
  play([95, 95]);                       // same tick -> both reach 0.3 s together
  assert.deepEqual(match.getState().scores, [1, 1]);
  play([95, 50]);                       // only P1
  assert.deepEqual(match.getState().scores, [4, 1]);
  play([20, 99]);                       // only P2
  const s = match.getState();
  assert.deepEqual(s.scores, [4, 4]);
  assert.equal(s.over, true);
  assert.equal(s.draw, true);           // equal total after 3 rounds = draw
});

test('hold time of 0.3 s resolves after 0.3 s of sustained match', () => {
  const round = createRoundState({ countdown: 3, threshold: 90, holdTime: 0.3, tie: 'both' });
  round.start();
  round.update(3.01, [0, 0]);
  round.update(0.2, [95, 0]);
  assert.equal(round.getState().phase, 'playing');
  round.update(0.1, [95, 0]);
  assert.equal(round.getState().phase, 'resolved');
});

console.log(`\n${passed} tests passed`);