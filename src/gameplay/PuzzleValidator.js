// Credit a one-pixel contour error on both silhouettes. Interior gaps,
// extra islands and large shifts still count at full cost.
function touchesMask(mask, x, y, width, height) {
  const row = y * width;
  return (x > 0 && mask[row + x - 1]) ||
    (x + 1 < width && mask[row + x + 1]) ||
    (y > 0 && mask[row + x - width]) ||
    (y + 1 < height && mask[row + x + width]);
}

export function compareSilhouettes(target, current, { width, height, edgeCredit }) {
  let intersection = 0;
  let union = 0;
  let nearEdge = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!target[i] && !current[i]) continue;
      union++;
      if (target[i] && current[i]) intersection++;
      else if (touchesMask(target[i] ? current : target, x, y, width, height)) nearEdge++;
    }
  }
  const similarity = union ? (intersection + nearEdge * edgeCredit) / union * 100 : 0;
  const percent = union && intersection === union ? 100 : Math.floor(similarity);
  return { similarity, percent };
}
