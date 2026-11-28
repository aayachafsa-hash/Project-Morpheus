// Pure duel rules: no DOM, no Three.js, no timers. Covered by tests/duel-rules.test.mjs.

export const DUEL_ROUND_OPTIONS = Object.freeze([3, 5, 7]);
export const DEFAULT_ROUNDS = 5;
export const DUEL_SOLVE_THRESHOLD = 0.90;
// A round that nobody solves ends after this long and the closer shadow wins it.
export const ROUND_TIME_LIMIT_S = 90;
// Solves this close together count as "at the same time" (about one scoring update).
export const SIMULTANEOUS_MS = 150;
// Timed-out rounds whose best matches differ by less than this many percentage points are a draw.
export const TIE_MARGIN = 1;

/** Earliest solve time of the two players, or null while nobody has solved. */
export function firstSolveAt(p1, p2) {
  const times = [p1.solvedAt, p2.solvedAt].filter(time => time != null);
  return times.length ? Math.min(...times) : null;
}

/**
 * Who won the round? p1/p2 are { solvedAt: ms | null, best: percent }.
 * Returns 'p1' | 'p2' | 'draw', or null while the round is still undecided.
 */
export function resolveRound({ p1, p2, timedOut = false }) {
  const a = p1.solvedAt, b = p2.solvedAt;
  if (a != null && b != null) return Math.abs(a - b) <= SIMULTANEOUS_MS ? 'draw' : a < b ? 'p1' : 'p2';
  if (a != null) return 'p1';
  if (b != null) return 'p2';
  if (!timedOut) return null;
  return Math.abs(p1.best - p2.best) < TIE_MARGIN ? 'draw' : p1.best > p2.best ? 'p1' : 'p2';
}

/** Team decision: round win 3 points, draw 1 point for EACH player, loss 0 (scores never go negative). */
export const DUEL_POINTS = Object.freeze({ win: 3, draw: 1, lose: 0 });

/** Points one player takes from a round whose result is 'p1' | 'p2' | 'draw'. */
export function roundPoints(winner, id) {
  if (winner === 'draw') return DUEL_POINTS.draw;
  return winner === id ? DUEL_POINTS.win : DUEL_POINTS.lose;
}

/**
 * Classic Duel: N scheduled rounds (3, 5 or 7). Every scheduled round is played; each round gives
 * win 3 / draw 1 each / lose 0. After the last round the higher total wins; equal totals = draw.
 */
export function createDuelMatch(totalRounds = DEFAULT_ROUNDS) {
  if (!DUEL_ROUND_OPTIONS.includes(totalRounds)) throw new RangeError(`A ${totalRounds}-round duel is not available`);
  const rounds = [];
  const wins = { p1: 0, p2: 0 };
  const points = { p1: 0, p2: 0 };
  const isOver = () => rounds.length >= totalRounds;
  const winner = () => !isOver() ? null : points.p1 === points.p2 ? 'draw' : points.p1 > points.p2 ? 'p1' : 'p2';
  return {
    totalRounds,
    get rounds() { return rounds.slice(); },
    /** Total points [p1, p2] (win 3 / draw 1 each / lose 0). */
    get score() { return [points.p1, points.p2]; },
    get over() { return isOver(); },
    get roundNumber() { return Math.min(totalRounds, rounds.length + (isOver() ? 0 : 1)); },
    get winner() { return winner(); },
    /** round = { level, winner, timedOut, p1: { best, solvedMs }, p2: { best, solvedMs } } */
    record(round) {
      if (isOver()) throw new Error('The match is already over');
      if (!['p1', 'p2', 'draw'].includes(round.winner)) throw new RangeError('A round needs a winner or a draw');
      rounds.push(Object.freeze({ ...round }));
      for (const id of ['p1', 'p2']) points[id] += roundPoints(round.winner, id);
      if (round.winner !== 'draw') wins[round.winner]++;
    },
    summary() {
      const average = id => rounds.length ? Math.round(rounds.reduce((sum, round) => sum + round[id].best, 0) / rounds.length) : 0;
      const fastest = id => {
        const times = rounds.map(round => round[id].solvedMs).filter(time => time != null);
        return times.length ? Math.min(...times) : null;
      };
      return {
        mode: `Classic Duel (${totalRounds} rounds)`, winner: winner(), score: [points.p1, points.p2],
        roundsPlayed: rounds.length, draws: rounds.filter(round => round.winner === 'draw').length,
        averageMatch: { p1: average('p1'), p2: average('p2') },
        bestTimeMs: { p1: fastest('p1'), p2: fastest('p2') },
        roundsWon: { p1: wins.p1, p2: wins.p2 },
      };
    },
  };
}

/** `count` levels from a shuffled deck; the same puzzle never appears twice in a row. */
export function pickLevels(levels, count, random = Math.random) {
  const deck = () => {
    const copy = levels.slice();
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  const picked = [];
  while (picked.length < count) {
    const next = deck();
    if (picked.length && next.length > 1 && next[0] === picked.at(-1)) [next[0], next[1]] = [next[1], next[0]];
    picked.push(...next);
  }
  return picked.slice(0, count);
}

export const formatSeconds = ms => ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
export function formatClock(ms) {
  if (ms == null) return '—';
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
