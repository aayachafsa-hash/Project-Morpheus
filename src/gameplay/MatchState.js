import { SOLVE_THRESHOLD } from './ScoringConstants.js';

export const NORMALIZE_TO_SOLVE_THRESHOLD = true;

export function fractionToPercent(fraction) {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * 100);
}

export function createMatchState(result, assisted = false) {
  const rawIoU = result.match;
  const scale = NORMALIZE_TO_SOLVE_THRESHOLD && !assisted ? SOLVE_THRESHOLD : 1;
  const percent = fractionToPercent(rawIoU / scale);
  return {
    rawIoU,
    displayPercent: result.solved ? percent : Math.min(99, percent),
    solved: result.solved,
    assisted: result.solved && assisted,
  };
}
