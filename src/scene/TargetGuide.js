import * as THREE from 'three';
import { CONFIG } from '../config.js?shadow-progress';

export function createTargetGuide(mask, wall) {
  const { width, height, left, right, bottom, top } = CONFIG.scoring;
  const depth = new THREE.Box3().setFromObject(wall, true).max.z + 0.018;
  const dx = (right - left) / width;
  const dy = (top - bottom) / height;
  const stride = width + 1;
  const edges = new Map();

  function addEdge(from, to) {
    const outgoing = edges.get(from) ?? [];
    outgoing.push(to);
    edges.set(from, outgoing);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const corner = y * stride + x;
      if (y === 0 || !mask[i - width]) addEdge(corner, corner + 1);
      if (x === width - 1 || !mask[i + 1]) addEdge(corner + 1, corner + stride + 1);
      if (y === height - 1 || !mask[i + width]) addEdge(corner + stride + 1, corner + stride);
      if (x === 0 || !mask[i - 1]) addEdge(corner + stride, corner);
    }
  }

  const points = [];
  const distances = [];
  function appendPoint(index, distance) {
    points.push(left + (index % stride) * dx, bottom + Math.floor(index / stride) * dy, depth);
    distances.push(distance);
  }

  // Follow adjacent edges so a dash continues around corners.
  while (edges.size) {
    let from = edges.keys().next().value;
    let distance = 0;
    while (edges.has(from)) {
      const outgoing = edges.get(from);
      const to = outgoing.pop();
      if (!outgoing.length) edges.delete(from);
      appendPoint(from, distance);
      distance += Math.abs(to - from) === 1 ? dx : dy;
      appendPoint(to, distance);
      from = to;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(distances, 1));
  const guide = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({
    color: CONFIG.selection.highlight, dashSize: 0.12, gapSize: 0.08,
    toneMapped: false, transparent: true, opacity: 0.86, depthWrite: false,
  }));
  guide.visible = false;
  return guide;
}
