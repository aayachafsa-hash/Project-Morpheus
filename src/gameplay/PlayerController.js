// Keyboard-driven control of ONE piece. The maths is the same as advanceKeyboard()
// and the damping block in ObjectController.js (Solo), moved here so that each
// player has an independent instance. ObjectController.js is left untouched, so
// the Solo route keeps working exactly as before.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { groundPiece, resetPiece } from './LevelManager.js';

const AXES = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
const AXIS_NAMES = ['Y', 'X', 'Z'];

export function createPlayerController(piece) {
  const { mesh, movement } = piece;
  let axisIndex = 0;
  const previousTarget = new THREE.Vector3();
  const previousRotation = new THREE.Quaternion();
  const deltaRotation = new THREE.Quaternion();
  const currentPose = new THREE.Vector3();
  const nextPose = new THREE.Vector3();
  const nextRotation = new THREE.Quaternion();

  return {
    get axisName() { return AXIS_NAMES[axisIndex]; },
    cycleAxis() { axisIndex = (axisIndex + 1) % AXES.length; },
    reset() {
      axisIndex = 0;
      resetPiece(piece);
    },
    // axes: { x, y, z, turn, precision } from InputManager.getAxes(). Returns the
    // active control kind ('' when nothing is pressed), like the Solo version.
    applyInput({ x, y, z, turn, precision }, delta) {
      if (!x && !y && !z && !turn) return '';
      const step = delta * (precision ? 0.35 : 1);
      const move = step * CONFIG.movement.keyMoveSpeed / Math.max(1, Math.hypot(x, z));
      previousTarget.copy(piece.targetPosition);
      previousRotation.copy(piece.targetRotation);
      piece.targetPosition.x += x * move;
      piece.targetPosition.y += y * step * CONFIG.movement.keyMoveSpeed;
      piece.targetPosition.z += z * move;
      deltaRotation.setFromAxisAngle(AXES[axisIndex], turn * step * CONFIG.movement.keyRotateSpeed);
      piece.targetRotation.premultiply(deltaRotation).normalize();
      movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
      if (y) return 'height';
      if (turn) return axisIndex === 0 ? 'rotate' : 'tilt';
      return x ? 'move' : 'depth';
    },
    // Damped approach of the mesh toward its target pose. Call every frame.
    // changed = the mesh moved this frame, so the shadow map and the score are stale.
    settle(delta) {
      const alpha = 1 - Math.exp(-CONFIG.movement.damping * delta);
      const positionGap = Math.abs(piece.height - piece.targetPosition.y)
        + Math.abs(mesh.position.x - piece.targetPosition.x)
        + Math.abs(mesh.position.z - piece.targetPosition.z);
      const moving = positionGap > 0.00001 || mesh.quaternion.angleTo(piece.targetRotation) > 0.00001;
      let changed = false;
      if (moving) {
        currentPose.set(mesh.position.x, piece.height, mesh.position.z);
        nextPose.lerpVectors(currentPose, piece.targetPosition, alpha);
        nextRotation.slerpQuaternions(mesh.quaternion, piece.targetRotation, alpha);
        movement.constrain(currentPose, mesh.quaternion, nextPose, nextRotation);
        if (nextPose.distanceToSquared(currentPose) > 0 || !nextRotation.equals(mesh.quaternion)) {
          piece.height = nextPose.y;
          mesh.position.copy(nextPose);
          mesh.quaternion.copy(nextRotation);
          groundPiece(piece);
          changed = true;
        } else {
          piece.targetPosition.copy(currentPose);
          piece.targetRotation.copy(mesh.quaternion);
        }
      }
      return { moving, changed };
    },
  };
}
