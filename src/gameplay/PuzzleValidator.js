export function measureOverlap(targetMask, currentMask) {
  let intersection = 0, union = 0;
  for (let i = 0; i < targetMask.length; i++) {
    intersection += targetMask[i] & currentMask[i];
    union += targetMask[i] | currentMask[i];
  }
  return union ? Math.round(intersection / union * 100) : 0;
}
