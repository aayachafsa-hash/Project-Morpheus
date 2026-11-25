// Match scoring above RoundState. No DOM, no Three.js.
// RoundState decides who won ONE round; ScoreManager turns round results into a match.
//
// Modes
//   classic   : `rounds` (3, 5 or 7) scheduled rounds. Each round win = one point on the
//               tally. After the scheduled rounds the higher tally wins the match.
//               Equal tally: drawRule 'draw' (match ends as a draw) or
//               'suddenDeath' (extra rounds until one player leads).
//   survival  : each player starts with `startingPoints`. A round win takes ONE point from
//               the opponent. The match ends when a player reaches zero.
//
// Values still to confirm with the team (kept configurable, see CONFIG.duel.match):
//   startingPoints (survival), drawRule (classic), and the round tie rule in RoundState.
//
// A round result is { winners: number[], tie: boolean, replay: boolean } as produced by
// RoundState. A replay round (nobody scores) does not use up a scheduled round.

const MODES = new Set(['classic', 'survival']);
const CLASSIC_ROUNDS = new Set([3, 5, 7]);

export function createScoreManager({
  mode = 'classic',
  rounds = 3,
  startingPoints = 5,
  drawRule = 'draw',
} = {}) {
  if (!MODES.has(mode)) throw new Error(`Unknown match mode "${mode}".`);
  if (mode === 'classic' && !CLASSIC_ROUNDS.has(rounds)) throw new Error('Classic rounds must be 3, 5 or 7.');
  if (mode === 'survival' && !(Number.isInteger(startingPoints) && startingPoints > 0)) {
    throw new Error('Survival startingPoints must be a positive integer.');
  }
  if (drawRule !== 'draw' && drawRule !== 'suddenDeath') throw new Error('drawRule must be "draw" or "suddenDeath".');

  let wins, points, roundsPlayed, over, matchWinner, draw, history, recorded;

  function reset() {
    wins = [0, 0];
    points = [startingPoints, startingPoints];
    roundsPlayed = 0;
    over = false;
    matchWinner = null;
    draw = false;
    history = [];
    recorded = new Set();
  }
  reset();

  function finish(winner) {
    over = true;
    matchWinner = winner;
    draw = winner === null;
  }

  function checkClassic() {
    if (roundsPlayed < rounds) return;
    if (wins[0] !== wins[1]) finish(wins[0] > wins[1] ? 0 : 1);
    else if (drawRule === 'draw') finish(null);
    // suddenDeath: keep playing extra rounds until the tally differs
  }

  function checkSurvival() {
    const empty = [0, 1].filter(i => points[i] <= 0);
    if (empty.length === 2) finish(null);
    else if (empty.length === 1) finish(1 - empty[0]);
  }

  return {
    reset,
    // Returns true if the round was counted. A replay round, a round already recorded
    // (same roundId) or a round after the end of the match is ignored.
    recordRound(result, roundId) {
      if (over || !result) return false;
      if (roundId !== undefined) {
        if (recorded.has(roundId)) return false;
        recorded.add(roundId);
      }
      if (result.replay) return false;
      roundsPlayed++;
      history.push([...result.winners]);
      for (const winner of result.winners) {
        if (mode === 'classic') wins[winner]++;
        else points[1 - winner] = Math.max(0, points[1 - winner] - 1);
      }
      if (mode === 'classic') checkClassic();
      else checkSurvival();
      return true;
    },
    getState() {
      return {
        mode, over, matchWinner, draw, roundsPlayed, drawRule,
        roundsTotal: mode === 'classic' ? rounds : null,
        wins: [...wins],
        points: [...points],
        history: history.map(winners => [...winners]),
      };
    },
  };
}
