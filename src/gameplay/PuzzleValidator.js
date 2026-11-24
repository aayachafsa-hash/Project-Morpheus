// Binary masks only: scoring never imports controls, transforms or solutions.
export function compareSilhouettes(target, current) {
  if (target.length !== current.length) throw new Error('Silhouette dimensions differ');
  let intersection = 0, union = 0;
  for (let i = 0; i < target.length; i++) {
    if (target[i] || current[i]) union++;
    if (target[i] && current[i]) intersection++;
  }
  const match = union ? intersection / union : 0;
  return { match, similarity: match * 100, percent: Math.round(match * 100) };
}
export function createScoreTracker({ SOLVE_THRESHOLD, SMOOTH_WINDOW, SOLVE_DWELL_MS = 500 }) {
  const samples = [];
  let solved = false;
  let aboveSince = null;
  return {
    push(target, mask, now = performance.now()) {
      const raw = compareSilhouettes(target, mask).match;
      samples.push(raw);
      if (samples.length > SMOOTH_WINDOW) samples.shift();
      const match = samples.reduce((a, b) => a + b, 0) / samples.length;
      const above = samples.length === SMOOTH_WINDOW && match >= SOLVE_THRESHOLD;
      aboveSince = above ? aboveSince ?? now : null;
      const justSolved = !solved && above && now - aboveSince >= SOLVE_DWELL_MS;
      solved ||= justSolved;
      return { raw, match, similarity: match * 100, percent: Math.round(match * 100), solved, justSolved };
    },
    reset() { samples.length = 0; solved = false; aboveSince = null; },
  };
}
