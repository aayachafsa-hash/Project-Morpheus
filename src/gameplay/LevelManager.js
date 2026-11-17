import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function groundPiece(piece, height = piece.height) {
  piece.mesh.position.y = piece.movement.groundHeight(piece.mesh.quaternion, height);
}


function setPose(piece, position, rotation, pose) {
  const { center } = piece.platform;
  position.set(center.x + pose.x, pose.height, center.z + pose.z);
  rotation.setFromEuler(new THREE.Euler(...pose.rotation));
}

export function resetPiece(piece) {
  setPose(piece, piece.targetPosition, piece.targetRotation, CONFIG.initial);
  piece.height = CONFIG.initial.height;
  piece.mesh.position.copy(piece.targetPosition);
  piece.mesh.quaternion.copy(piece.targetRotation);
  groundPiece(piece);
}

export function setSolutionTarget(piece, position = piece.targetPosition, rotation = piece.targetRotation) {
  setPose(piece, position, rotation, CONFIG.solution);
}

export function createTargetMask(piece, { invalidateShadows, captureShadowMask }) {
  const { mesh } = piece;
  const position = mesh.position.clone();
  const rotation = mesh.quaternion.clone();
  const pose = CONFIG.solution;
  setPose(piece, mesh.position, mesh.quaternion, pose);
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
