// One duel round as a small state machine, with no DOM and no Three.js.
//   idle -> countdown -> playing -> resolved -> (reset / start) -> ...
// A player "reaches" the target when their score stays >= threshold for holdTime
// seconds; the timer restarts from zero whenever the score drops below threshold.
// The round resolves exactly once; later updates are ignored until reset()/start().
//
// All numbers are provisional and come from CONFIG.duel:
//   threshold (%), holdTime (s), countdown (s), tie rule.
// Tie rule when both players reach the hold time on the same update:
//   'replay'      nobody scores, the round is played again   (default, to confirm)
//   'higherScore' the higher score wins (equal scores -> replay)
//   'both'        both players score

export function createRoundState({
  countdown = 3,
  threshold = 90,
  holdTime = 0.5,
  tie = 'replay',
  players = 2,
} = {}) {
  let phase = 'idle';
  let remaining = 0;
  let paused = false;
  let roundId = 0;
  let result = null;
  const holds = new Array(players).fill(0);

  function reset() {
    phase = 'idle';
    remaining = 0;
    result = null;
    paused = false;
    holds.fill(0);
    roundId++;
  }

  function resolve(reached, scores) {
    let winners = reached;
    let replay = false;
    if (reached.length > 1) {
      if (tie === 'both') {
        winners = reached;
      } else if (tie === 'higherScore') {
        const best = Math.max(...reached.map(i => scores[i]));
        const top = reached.filter(i => scores[i] === best);
        winners = top.length === 1 ? top : [];
        replay = top.length !== 1;
      } else {
        winners = [];
        replay = true;
      }
    }
    result = { winners, tie: reached.length > 1, replay };
    phase = 'resolved';
  }

  return {
    reset,
    start() {
      if (phase === 'countdown' || phase === 'playing') return false;
      reset();
      phase = 'countdown';
      remaining = countdown;
      return true;
    },
    setPaused(value) { paused = Boolean(value); },
    isInputEnabled() { return phase === 'playing' && !paused; },
    // dt in seconds, scores = one similarity value (0..100) per player, same sample for both.
    update(dt, scores) {
      if (paused) return;
      if (phase === 'countdown') {
        remaining -= dt;
        if (remaining <= 0) {
          remaining = 0;
          phase = 'playing';
          holds.fill(0);
        }
        return;
      }
      if (phase !== 'playing') return;
      const reached = [];
      for (let i = 0; i < players; i++) {
        if ((scores[i] ?? 0) >= threshold) {
          holds[i] += dt;
          if (holds[i] >= holdTime) reached.push(i);
        } else {
          holds[i] = 0;
        }
      }
      if (reached.length) resolve(reached, scores);
    },
    getState() {
      return {
        phase, remaining, paused, roundId, threshold, holdTime,
        holds: [...holds],
        result: result && { ...result, winners: [...result.winners] },
      };
    },
  };
}
