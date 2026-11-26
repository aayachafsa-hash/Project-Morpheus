import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDuelMatch, firstSolveAt, formatClock, formatSeconds, pickLevels, resolveRound, SIMULTANEOUS_MS,
} from '../src/gameplay/DuelRules.js';

const player = (solvedAt = null, best = 0) => ({ solvedAt, best });
const round = (winner, p1 = {}, p2 = {}) => ({ level: 'Teapot', winner, timedOut: false,
  p1: { best: 100, solvedMs: null, ...p1 }, p2: { best: 80, solvedMs: null, ...p2 } });

test('first solver wins the round', () => {
  assert.equal(resolveRound({ p1: player(5000), p2: player(7000) }), 'p1');
  assert.equal(resolveRound({ p1: player(), p2: player(7000) }), 'p2');
  assert.equal(resolveRound({ p1: player(9000), p2: player(5000) }), 'p2');
});
test('solving within one scoring tick of each other is a draw', () => {
  assert.equal(resolveRound({ p1: player(5000), p2: player(5000) }), 'draw');
  assert.equal(resolveRound({ p1: player(5000), p2: player(5000 + SIMULTANEOUS_MS) }), 'draw');
  assert.equal(resolveRound({ p1: player(5000), p2: player(5000 + SIMULTANEOUS_MS + 1) }), 'p1');
});
test('undecided until someone solves or time runs out', () => {
  assert.equal(resolveRound({ p1: player(null, 50), p2: player(null, 40) }), null);
});
test('time-out: closer shadow wins, near-equal is a draw', () => {
  assert.equal(resolveRound({ p1: player(null, 70), p2: player(null, 55), timedOut: true }), 'p1');
  assert.equal(resolveRound({ p1: player(null, 40), p2: player(null, 62), timedOut: true }), 'p2');
  assert.equal(resolveRound({ p1: player(null, 60.4), p2: player(null, 60), timedOut: true }), 'draw');
});
test('firstSolveAt ignores players who have not solved', () => {
  assert.equal(firstSolveAt(player(), player()), null);
  assert.equal(firstSolveAt(player(900), player()), 900);
  assert.equal(firstSolveAt(player(900), player(400)), 400);
});

test('best of 3 ends as soon as a player has two wins', () => {
  const match = createDuelMatch(3);
  assert.equal(match.winsNeeded, 2);
  assert.equal(match.roundNumber, 1);
  match.record(round('p1'));
  assert.equal(match.over, false);
  assert.equal(match.roundNumber, 2);
  match.record(round('p1'));
  assert.equal(match.over, true);
  assert.equal(match.winner, 'p1');
  assert.deepEqual(match.score, [2, 0]);
  assert.equal(match.roundNumber, 2);
  assert.throws(() => match.record(round('p2')), /already over/);
});
test('draws score nothing and the match can end level', () => {
  const match = createDuelMatch(3);
  match.record(round('draw')); match.record(round('draw')); match.record(round('draw'));
  assert.equal(match.over, true);
  assert.equal(match.winner, 'draw');
  assert.deepEqual(match.score, [0, 0]);
});
test('a draw round does not stop the leader from winning the match later', () => {
  const match = createDuelMatch(5);
  match.record(round('p2')); match.record(round('draw')); match.record(round('p2')); match.record(round('p1'));
  assert.equal(match.over, false);
  match.record(round('p2'));
  assert.equal(match.winner, 'p2');
  assert.deepEqual(match.score, [1, 3]);
});
test('only 3, 5 and 7 rounds are offered', () => {
  assert.throws(() => createDuelMatch(4), RangeError);
  assert.doesNotThrow(() => createDuelMatch(7));
});
test('round needs a valid winner', () => {
  assert.throws(() => createDuelMatch(3).record({ ...round('p1'), winner: 'nobody' }), RangeError);
});
test('summary matches the reference sheet fields', () => {
  const match = createDuelMatch(5);
  match.record(round('p1', { best: 100, solvedMs: 18000 }, { best: 90, solvedMs: null }));
  match.record(round('p2', { best: 86, solvedMs: null }, { best: 100, solvedMs: 21000 }));
  match.record(round('p1', { best: 99, solvedMs: 25000 }, { best: 80 }));
  const summary = match.summary();
  assert.equal(summary.mode, 'Classic Duel (Best of 5)');
  assert.deepEqual(summary.score, [2, 1]);
  assert.equal(summary.winner, null);          // not over yet: 2 of 3 wins needed
  assert.deepEqual(summary.averageMatch, { p1: 95, p2: 90 });
  assert.deepEqual(summary.bestTimeMs, { p1: 18000, p2: 21000 });
  assert.deepEqual(summary.roundsWon, { p1: 2, p2: 1 });
  match.record(round('p1'));
  assert.equal(match.summary().winner, 'p1');
});

test('pickLevels: right count, valid levels, never the same puzzle twice in a row', () => {
  const levels = ['a', 'b', 'c', 'd', 'e'];
  for (let seed = 1; seed <= 200; seed++) {
    let state = seed;
    const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const picked = pickLevels(levels, 7, random);
    assert.equal(picked.length, 7);
    assert.ok(picked.every(level => levels.includes(level)));
    for (let i = 1; i < picked.length; i++) assert.notEqual(picked[i], picked[i - 1], `seed ${seed}`);
    assert.equal(new Set(picked.slice(0, 5)).size, 5, 'first deck uses every level once');
  }
});

test('time formatting', () => {
  assert.equal(formatSeconds(12400), '12.4s');
  assert.equal(formatSeconds(null), '—');
  assert.equal(formatClock(18000), '00:18');
  assert.equal(formatClock(90000), '01:30');
  assert.equal(formatClock(null), '—');
});
