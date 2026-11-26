// Pure duel rules: no DOM, no Three.js, no timers. Covered by tests/duel-rules.test.mjs.

export const DUEL_ROUND_OPTIONS = Object.freeze([3, 5, 7]);
export const DEFAULT_ROUNDS = 5;
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

/**
 * Classic Duel: best of N. First to a majority ends the match early; draws score nothing.
 * If all N rounds are played and the score is level, the match is a draw.
 */
export function createDuelMatch(totalRounds = DEFAULT_ROUNDS) {
  if (!DUEL_ROUND_OPTIONS.includes(totalRounds)) throw new RangeError(`Best of ${totalRounds} is not available`);
  const winsNeeded = Math.floor(totalRounds / 2) + 1;
  const rounds = [];
  const wins = { p1: 0, p2: 0 };
  const isOver = () => wins.p1 >= winsNeeded || wins.p2 >= winsNeeded || rounds.length >= totalRounds;
  const winner = () => !isOver() ? null : wins.p1 === wins.p2 ? 'draw' : wins.p1 > wins.p2 ? 'p1' : 'p2';
  return {
    totalRounds, winsNeeded,
    get rounds() { return rounds.slice(); },
    get score() { return [wins.p1, wins.p2]; },
    get over() { return isOver(); },
    get roundNumber() { return Math.min(totalRounds, rounds.length + (isOver() ? 0 : 1)); },
    get winner() { return winner(); },
    /** round = { level, winner, timedOut, p1: { best, solvedMs }, p2: { best, solvedMs } } */
    record(round) {
      if (isOver()) throw new Error('The match is already over');
      if (!['p1', 'p2', 'draw'].includes(round.winner)) throw new RangeError('A round needs a winner or a draw');
      rounds.push(Object.freeze({ ...round }));
      if (round.winner !== 'draw') wins[round.winner]++;
    },
    summary() {
      const average = id => rounds.length ? Math.round(rounds.reduce((sum, round) => sum + round[id].best, 0) / rounds.length) : 0;
      const fastest = id => {
        const times = rounds.map(round => round[id].solvedMs).filter(time => time != null);
        return times.length ? Math.min(...times) : null;
      };
      return {
        mode: `Classic Duel (Best of ${totalRounds})`, winner: winner(), score: [wins.p1, wins.p2],
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
