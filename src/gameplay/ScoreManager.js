// Match scoring above RoundState. No DOM, no Three.js.
// RoundState decides who won ONE round; ScoreManager turns round results into a match.
//
// Modes
//   classic   : `rounds` (3, 5 or 7) scheduled rounds. Points are only ever ADDED:
//                 round win  -> `win`  points (default 3) for the winner, `lose` (0) for the other
//                 round tie  -> `draw` points (default 1) for EACH player
//               After the scheduled rounds the higher total wins the match.
//               Equal total: drawRule 'draw' (match ends as a draw, team decision) or
//               'suddenDeath' (extra rounds until one player leads).
//   survival  : (kept, not yet confirmed by the team) each player starts with
//               `startingPoints`; a round win takes ONE point from the opponent (never below 0);
//               the match ends when a player reaches zero.
//
// A round result is { winners: number[], tie: boolean, replay: boolean } as produced by
// RoundState. Two winners = the round was a tie that gives each player the draw points.
// A replay round (nobody scores) does not use up a scheduled round.

const MODES = new Set(['classic', 'survival']);
const CLASSIC_ROUNDS = new Set([3, 5, 7]);

export function createScoreManager({
  mode = 'classic',
  rounds = 3,
  startingPoints = 5,
  drawRule = 'draw',
  points: roundPoints = { win: 3, draw: 1, lose: 0 },
} = {}) {
  if (!MODES.has(mode)) throw new Error(`Unknown match mode "${mode}".`);
  if (mode === 'classic' && !CLASSIC_ROUNDS.has(rounds)) throw new Error('Classic rounds must be 3, 5 or 7.');
  if (mode === 'survival' && !(Number.isInteger(startingPoints) && startingPoints > 0)) {
    throw new Error('Survival startingPoints must be a positive integer.');
  }
  if (drawRule !== 'draw' && drawRule !== 'suddenDeath') throw new Error('drawRule must be "draw" or "suddenDeath".');
  for (const key of ['win', 'draw', 'lose']) {
    if (!(Number.isFinite(roundPoints[key]) && roundPoints[key] >= 0)) {
      throw new Error(`points.${key} must be a number >= 0 (scores never go negative).`);
    }
  }

  let scores, wins, draws, losses, remaining, roundsPlayed, over, matchWinner, draw, history, recorded;

  function reset() {
    scores = [0, 0];            // classic: accumulated 3/1/0 points
    wins = [0, 0];              // rounds won
    draws = [0, 0];             // rounds tied
    losses = [0, 0];            // rounds lost
    remaining = [startingPoints, startingPoints]; // survival: points left
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
    if (scores[0] !== scores[1]) finish(scores[0] > scores[1] ? 0 : 1);
    else if (drawRule === 'draw') finish(null);
    // suddenDeath: keep playing extra rounds until the totals differ
  }

  function checkSurvival() {
    const empty = [0, 1].filter(i => remaining[i] <= 0);
    if (empty.length === 2) finish(null);
    else if (empty.length === 1) finish(1 - empty[0]);
  }

  function applyClassic(winners) {
    if (winners.length === 2) { // tie: each player gets the draw points
      for (const i of [0, 1]) { scores[i] += roundPoints.draw; draws[i]++; }
    } else if (winners.length === 1) {
      const [winner] = winners;
      scores[winner] += roundPoints.win;
      scores[1 - winner] += roundPoints.lose;
      wins[winner]++;
      losses[1 - winner]++;
    }
  }

  function applySurvival(winners) {
    for (const winner of winners) remaining[1 - winner] = Math.max(0, remaining[1 - winner] - 1);
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
      if (mode === 'classic') { applyClassic(result.winners); checkClassic(); }
      else { applySurvival(result.winners); checkSurvival(); }
      return true;
    },
    getState() {
      return {
        mode, over, matchWinner, draw, roundsPlayed, drawRule,
        roundsTotal: mode === 'classic' ? rounds : null,
        scores: mode === 'classic' ? [...scores] : null,    // classic totals (3/1/0)
        points: mode === 'survival' ? [...remaining] : null, // survival points left
        wins: [...wins], draws: [...draws], losses: [...losses],
        history: history.map(winners => [...winners]),
      };
    },
  };
}