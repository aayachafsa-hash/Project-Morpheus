import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createTargetMask, groundPiece, resetPiece, setSolutionTarget } from './LevelManager.js';
import { measureOverlap } from './PuzzleValidator.js';

export function startGameplay(view, shadows, ui) {
  const { canvas, camera, piece } = view;
  const { mesh } = piece;

  let mode = 'move';
  let drag = null;
  let paused = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.table.y);
  const hitPoint = new THREE.Vector3();
  const deltaRotation = new THREE.Quaternion();
  const yawAxis = new THREE.Vector3(0, 1, 0);
  const tiltEuler = new THREE.Euler();

  function updateMode() {
    const cursors = { move: 'grab', height: 'ns-resize', rotate: 'ew-resize' };
    canvas.style.cursor = paused ? 'default' : drag ? 'grabbing' : cursors[mode];
  }

  function clampPosition(position) {
    position.y = THREE.MathUtils.clamp(position.y, 0, CONFIG.movement.maxHeight);
    position.x = THREE.MathUtils.clamp(position.x, CONFIG.movement.minX, CONFIG.movement.maxX);
    position.z = THREE.MathUtils.clamp(position.z, CONFIG.movement.minZ, CONFIG.movement.maxZ);
  }
  function setRay(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function reset() {
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    resetPiece(piece);
    mode = 'move';
    paused = false;
    ui.setPaused(false);
    piece.outline.visible = true;
    updateMode();
    shadows.invalidateShadows();
  }

  canvas.addEventListener('pointerdown', event => {
    if (paused || event.button !== 0 || drag) return;
    canvas.focus({ preventScroll: true });
    setRay(event);
    if (!raycaster.ray.intersectPlane(tablePlane, hitPoint)) return;
    const position = piece.targetPosition;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: position.x - hitPoint.x, offsetZ: position.z - hitPoint.z };
    canvas.setPointerCapture(event.pointerId);
    updateMode();
  });
  canvas.addEventListener('pointermove', event => {
    if (paused || !drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setRay(event);
    const tableHit = raycaster.ray.intersectPlane(tablePlane, hitPoint);
    if (event.shiftKey) {
      tiltEuler.set(dy * CONFIG.movement.rotateSpeed, 0, -dx * CONFIG.movement.rotateSpeed);
      deltaRotation.setFromEuler(tiltEuler);
      piece.targetRotation.premultiply(deltaRotation).normalize();
    } else if (mode === 'height') {
      piece.targetPosition.y -= dy * CONFIG.movement.heightSpeed;
      clampPosition(piece.targetPosition);
    } else if (mode === 'rotate') {
      deltaRotation.setFromAxisAngle(yawAxis, dx * CONFIG.movement.rotateSpeed);
      piece.targetRotation.premultiply(deltaRotation).normalize();
    } else if (tableHit) {
      piece.targetPosition.x = hitPoint.x + drag.offsetX;
      piece.targetPosition.z = hitPoint.z + drag.offsetZ;
      clampPosition(piece.targetPosition);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    // Keep the piece in place when the drag mode changes.
    if (tableHit) {
      drag.offsetX = piece.targetPosition.x - hitPoint.x;
      drag.offsetZ = piece.targetPosition.z - hitPoint.z;
    }
  });
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const id = drag.id;
    drag = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    updateMode();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (paused) return;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    const before = piece.targetPosition.z;
    piece.targetPosition.z += THREE.MathUtils.clamp(pixels, -160, 160) * CONFIG.movement.wheelSpeed;
    clampPosition(piece.targetPosition);
    if (drag) drag.offsetZ += piece.targetPosition.z - before;
  }, { passive: false });
  addEventListener('keydown', event => {
    if (paused) return;
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === 'Escape') mode = 'move';
    if (!event.repeat && event.code === 'KeyR') mode = mode === 'rotate' ? 'move' : 'rotate';
    if (!event.repeat && event.code === 'KeyZ') mode = mode === 'height' ? 'move' : 'height';
    updateMode();
  });
  function showSolution() {
    if (paused) return;
    if (drag) endDrag({ pointerId: drag.id });
    setSolutionTarget(piece);
  }

  function togglePause() {
    paused = !paused;
    if (drag) endDrag({ pointerId: drag.id });
    ui.setPaused(paused);
    updateMode();
  }

  let checkRequested = false;
  ui.bindControls({
    reset, showSolution, togglePause,
    check() { checkRequested = true; },
  });
  reset();
  view.resize();
  const targetMask = createTargetMask(piece, shadows);
  if (!targetMask.some(Boolean)) throw new Error('The target shadow mask is empty. Check the light and scoring bounds.');
  ui.drawTargetMask(targetMask);
  const clock = new THREE.Clock();
  let scoreElapsed = CONFIG.scoring.interval;
  let frameCount = 0, frameTime = 0;
  let scoreDirty = true;
  view.setAnimationLoop(() => {
    if (shadows.shadowsNeedUpdate()) scoreDirty = true;
    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    frameCount++;
    frameTime += rawDelta;
    if (frameTime >= 1) {
      ui.setPerformance(`${Math.round(frameCount / frameTime)} FPS`);
      frameCount = 0;
      frameTime = 0;
    }
    const alpha = 1 - Math.exp(-CONFIG.movement.damping * delta);
    const positionGap = Math.abs(piece.height - piece.targetPosition.y)
      + Math.abs(mesh.position.x - piece.targetPosition.x)
      + Math.abs(mesh.position.z - piece.targetPosition.z);
    const moving = positionGap > 0.00001 || mesh.quaternion.angleTo(piece.targetRotation) > 0.00001;
    if (moving && !paused) {
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, piece.targetPosition.x, alpha);
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, piece.targetPosition.z, alpha);
      piece.height = THREE.MathUtils.lerp(piece.height, piece.targetPosition.y, alpha);
      mesh.quaternion.slerp(piece.targetRotation, alpha);
      groundPiece(piece);
      shadows.invalidateShadows();
      scoreDirty = true;
    }
    scoreElapsed += delta;
    if (checkRequested || (scoreDirty && scoreElapsed >= CONFIG.scoring.interval)) {
      const currentMask = shadows.captureShadowMask();
      const lastMatch = measureOverlap(targetMask, currentMask);
      ui.setMatch(lastMatch);
      checkRequested = false;
      scoreElapsed = 0;
      scoreDirty = false;
    }
    view.renderSelection(piece);
  });
}
