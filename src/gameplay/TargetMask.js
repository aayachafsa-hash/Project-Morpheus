import { MASK_RES } from './ScoringConstants.js';
export async function loadTargetMask(url) {
  const image = new Image(); image.src = url; await image.decode();
  if (image.width !== MASK_RES || image.height !== MASK_RES) throw new Error('Target must be a pre-thresholded 256x256 wall-space mask');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = MASK_RES;
  const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, MASK_RES, MASK_RES).data;
  const mask = new Uint8Array(MASK_RES * MASK_RES);
  for (let y = 0; y < MASK_RES; y++) for (let x = 0; x < MASK_RES; x++) {
    const i = (y * MASK_RES + x) * 4;
    // Canvas decoding/color management can perturb even a pre-thresholded PNG.
    // Canonicalize decoded pixels instead of rejecting the entire puzzle.
    mask[(MASK_RES - 1 - y) * MASK_RES + x] = pixels[i] >= 128 && pixels[i + 3] >= 128 ? 1 : 0;
  }
  if (!mask.some(Boolean)) throw new Error('Empty target silhouette');
  return mask;
}
