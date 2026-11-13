import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Height means clearance above the table, independent of rotation and depth.
// Zero rests on the table; positive height allows free vertical arrangement.
const vertex = new THREE.Vector3();
export function groundPiece(piece, height = piece.height) {
  const vertices = piece.mesh.geometry.attributes.position;
  let minY = Infinity;
  for (let i = 0; i < vertices.count; i++) {
    vertex.fromBufferAttribute(vertices, i).applyQuaternion(piece.mesh.quaternion);
    minY = Math.min(minY, vertex.y);
  }
  piece.mesh.position.y = CONFIG.table.y - minY + CONFIG.movement.clearance + height;
}


function setTarget(piece, pose) {
  piece.targetPosition.set(pose.x, pose.height, pose.z);
  piece.targetRotation.setFromEuler(new THREE.Euler(...pose.rotation));
}

export function resetPiece(piece) {
  setTarget(piece, CONFIG.initial);
  piece.height = CONFIG.initial.height;
  piece.mesh.position.copy(piece.targetPosition);
  piece.mesh.quaternion.copy(piece.targetRotation);
  groundPiece(piece);
}

export function setSolutionTarget(piece) {
  setTarget(piece, CONFIG.solution);
}

export function createTargetMask(piece, { invalidateShadows, captureShadowMask }) {
  const { mesh } = piece;
  const position = mesh.position.clone();
  const rotation = mesh.quaternion.clone();
  const pose = CONFIG.solution;
  mesh.position.set(pose.x, 0, pose.z);
  mesh.quaternion.setFromEuler(new THREE.Euler(...pose.rotation));
  groundPiece(piece, pose.height);
  invalidateShadows();

  try {
    return captureShadowMask();
  } finally {
    mesh.position.copy(position);
    mesh.quaternion.copy(rotation);
    invalidateShadows();
  }
}
