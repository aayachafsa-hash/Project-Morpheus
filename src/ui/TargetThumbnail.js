export function cropBounds(pixels, width, height, contains = (data, offset) => data[offset + 3] > 0) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!contains(pixels, (y * width + x) * 4)) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Empty target thumbnail');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export async function paintReference(canvas, url) {
  const source = new Image();
  source.src = url;
  await source.decode();
  const original = document.createElement('canvas');
  original.width = source.naturalWidth;
  original.height = source.naturalHeight;
  const ctx = original.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, original.width, original.height);
  const { x, y, width, height } = cropBounds(data, original.width, original.height);
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
}
