import * as THREE from 'three';
import { CONFIG } from '../config.js?shadow-progress';
import { createTargetMask, groundPiece, resetPiece, setSolutionTarget } from './LevelManager.js?shadow-progress';
import { compareSilhouettes } from './PuzzleValidator.js?shadow-progress';

export function startGameplay(view, shadows, ui) {
  const { canvas, camera, piece } = view;
  const { mesh, platform, movement } = piece;

  let mode = 'move';
  let drag = null;
  let paused = false;
  let rotationAxis = 0;
  let rotateKeyTime = null;
  let wheelFeedback = 0;
  let checkRequested = false;
  let lastMatch = null;
  let completed = false;
  let assisted = false;
  let settleTime = 0;
  let playTime = 0;
  let guideTime = 0;
  const rules = CONFIG.scoring;
  const pressed = new Set();
  const heldControls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ShiftLeft']);
  const axes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  const tapDuration = 180;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -platform.y);
  const previousTarget = new THREE.Vector3();
  const previousRotation = new THREE.Quaternion();
  const currentPose = new THREE.Vector3();
  const nextPose = new THREE.Vector3();
  const nextRotation = new THREE.Quaternion();
  const solutionPosition = new THREE.Vector3();
  const solutionRotation = new THREE.Quaternion();
  const hitPoint = new THREE.Vector3();
  const lastHitPoint = new THREE.Vector3();
  const deltaRotation = new THREE.Quaternion();
  const tiltEuler = new THREE.Euler();
  const selection = { mode, active: false, direction: 0, paused: false };

  function updateMode() {
    const cursors = { move: 'grab', height: 'ns-resize', rotate: 'ew-resize', tilt: 'grabbing' };
    canvas.style.cursor = paused || completed ? 'default' : drag?.mode === 'move' ? 'grabbing' : cursors[drag?.mode ?? mode];
    ui.setMode(paused || completed ? '' : drag?.mode ?? mode);
    ui.setRotationAxis(['Y', 'X', 'Z'][rotationAxis]);
  }

  function setRay(x, y, rect) {
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function clearInput() {
    if (drag) endDrag({ pointerId: drag.id });
    pressed.clear();
    rotateKeyTime = null;
    wheelFeedback = 0;
  }
  function reset() {
    clearInput();
    resetPiece(piece);
    mode = 'move';
    rotationAxis = 0;
    paused = false;
    completed = false;
    assisted = false;
    lastMatch = null;
    checkRequested = true;
    settleTime = playTime = guideTime = 0;
    ui.setPaused(false);
    piece.outline.visible = true;
    updateMode();
    shadows.invalidateShadows();
  }

  canvas.addEventListener('pointerdown', event => {
    if (paused || completed || event.button !== 0 || drag) return;
    setRay(event.clientX, event.clientY, canvas.getBoundingClientRect());
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit) return;
    canvas.focus({ preventScroll: true });
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      yOffset: hit.point.y - mesh.position.y,
      mode: event.shiftKey ? 'tilt' : mode,
    };
    canvas.setPointerCapture(event.pointerId);
    updateMode();
  });
  canvas.addEventListener('pointermove', event => {
    if (paused || !drag || event.pointerId !== drag.id) return;
    const rect = canvas.getBoundingClientRect();
    const sensitivity = 900 / Math.max(1, rect.height);
    const dx = (event.clientX - drag.x) * sensitivity;
    const dy = (event.clientY - drag.y) * sensitivity;
    const dragMode = event.shiftKey ? 'tilt' : mode;
    previousTarget.copy(piece.targetPosition);
    previousRotation.copy(piece.targetRotation);
    if (dragMode === 'tilt') {
      tiltEuler.set(dy * CONFIG.movement.rotateSpeed, 0, -dx * CONFIG.movement.rotateSpeed);
      deltaRotation.setFromEuler(tiltEuler);
      piece.targetRotation.premultiply(deltaRotation).normalize();
    } else if (dragMode === 'height') {
      piece.targetPosition.y -= dy * CONFIG.movement.heightSpeed;
    } else if (dragMode === 'rotate') {
      deltaRotation.setFromAxisAngle(axes[0], dx * CONFIG.movement.rotateSpeed);
      piece.targetRotation.premultiply(deltaRotation).normalize();
    } else {
      // Intersect both cursor samples at the grabbed point's current elevation.
      // This keeps the drag anchored through perspective, height and mode changes.
      dragPlane.constant = -(mesh.position.y + drag.yOffset);
      setRay(drag.x, drag.y, rect);
      const lastHit = raycaster.ray.intersectPlane(dragPlane, lastHitPoint);
      setRay(event.clientX, event.clientY, rect);
      if (lastHit && raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        piece.targetPosition.x += hitPoint.x - lastHitPoint.x;
        piece.targetPosition.z += hitPoint.z - lastHitPoint.z;
      }
    }
    movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.mode !== dragMode) {
      drag.mode = dragMode;
      updateMode();
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
    if (paused || completed || event.ctrlKey) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    previousTarget.copy(piece.targetPosition);
    previousRotation.copy(piece.targetRotation);
    piece.targetPosition.z += THREE.MathUtils.clamp(pixels, -160, 160) * CONFIG.movement.wheelSpeed;
    movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
    wheelFeedback = 0.45;
  }, { passive: false });
  addEventListener('keydown', event => {
    if (paused || completed || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (heldControls.has(event.code)) {
      if (event.code !== 'ShiftLeft') event.preventDefault();
      pressed.add(event.code);
    }
    if (event.code === 'Escape') mode = 'move';
    if (!event.repeat && event.code === 'KeyR') rotateKeyTime = performance.now();
    if (!event.repeat && event.code === 'KeyZ') mode = mode === 'height' ? 'move' : 'height';
    if (!event.repeat && event.code === 'KeyT') rotationAxis = (rotationAxis + 1) % axes.length;
    updateMode();
  });
  addEventListener('keyup', event => {
    pressed.delete(event.code);
    if (event.code === 'KeyR' && rotateKeyTime !== null) {
      if (performance.now() - rotateKeyTime < tapDuration) mode = mode === 'rotate' ? 'move' : 'rotate';
      rotateKeyTime = null;
      updateMode();
    }
  });
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInput();
  });

  function advanceKeyboard(delta) {
    const x = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
    const z = Number(pressed.has('KeyS')) - Number(pressed.has('KeyW'));
    const raise = rotateKeyTime !== null && performance.now() - rotateKeyTime >= tapDuration;
    const y = Number(raise) - Number(pressed.has('KeyF'));
    const turn = Number(pressed.has('KeyE')) - Number(pressed.has('KeyQ'));
    if (!x && !z && !y && !turn) return '';
    const step = delta * (pressed.has('ShiftLeft') ? 0.35 : 1);
    const move = step * CONFIG.movement.keyMoveSpeed / Math.max(1, Math.hypot(x, z));
    previousTarget.copy(piece.targetPosition);
    previousRotation.copy(piece.targetRotation);
    piece.targetPosition.x += x * move;
    piece.targetPosition.y += y * step * CONFIG.movement.keyMoveSpeed;
    piece.targetPosition.z += z * move;
    deltaRotation.setFromAxisAngle(axes[rotationAxis], turn * step * CONFIG.movement.keyRotateSpeed);
    piece.targetRotation.premultiply(deltaRotation).normalize();
    movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
    if (y) return 'height';
    if (turn) return rotationAxis === 0 ? 'rotate' : 'tilt';
    return x ? 'move' : 'depth';
  }

  function showSolution() {
    if (paused || completed) return;
    clearInput();
    assisted = true;
    setSolutionTarget(piece);
    // The solution pose is shared with the target render. Apply it directly
    // so intervening rotations cannot move the silhouette out of the beam.
    piece.height = piece.targetPosition.y;
    mesh.position.copy(piece.targetPosition);
    mesh.quaternion.copy(piece.targetRotation);
    groundPiece(piece);
    shadows.invalidateShadows();
    checkRequested = true;
  }

  function canAssist() {
    return !paused && !completed &&
      (playTime >= rules.assistDelay || (lastMatch?.similarity ?? 0) >= rules.nearMatch);
  }

  function assist() {
    if (!canAssist()) return;
    clearInput();
    assisted = true;
    guideTime = 5;
    previousTarget.set(mesh.position.x, piece.height, mesh.position.z);
    previousRotation.copy(mesh.quaternion);
    setSolutionTarget(piece, solutionPosition, solutionRotation);
    const distance = previousTarget.distanceTo(solutionPosition);
    const fraction = Math.min(0.65, distance ? rules.assistDistance / distance : 0);
    piece.targetPosition.lerpVectors(previousTarget, solutionPosition, fraction);
    const angle = previousRotation.angleTo(solutionRotation);
    const angleStep = Math.min(angle * 0.65, THREE.MathUtils.degToRad(rules.assistAngle));
    piece.targetRotation.copy(previousRotation).rotateTowards(solutionRotation, angleStep);
    movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
    // At the rim, move inward first if the combined step cannot make progress.
    if (piece.targetPosition.distanceToSquared(previousTarget) < 0.000001 &&
        piece.targetRotation.angleTo(previousRotation) < 0.000001) {
      piece.targetPosition.lerpVectors(previousTarget, solutionPosition, fraction);
      piece.targetRotation.copy(previousRotation);
      movement.constrain(previousTarget, previousRotation, piece.targetPosition, piece.targetRotation);
    }
  }

  function togglePause() {
    paused = !paused;
    clearInput();
    ui.setPaused(paused);
    updateMode();
  }

  ui.bindControls({
    reset, showSolution, assist, togglePause,
    check() { checkRequested = true; },
  });
  reset();
  view.resize();
  const targetMask = createTargetMask(piece, shadows);
  if (!targetMask.some(Boolean)) throw new Error('The target shadow mask is empty. Check the light and scoring bounds.');
  ui.drawTargetMask(targetMask);
  shadows.initializeGuide(targetMask);
  const clock = new THREE.Clock();
  let scoreElapsed = rules.interval;
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
    const keyboardMode = paused || completed ? '' : advanceKeyboard(delta);
    wheelFeedback = Math.max(0, wheelFeedback - delta);
    const heightGap = piece.targetPosition.y - piece.height;
    selection.mode = drag?.mode ?? (keyboardMode || (wheelFeedback ? 'depth' : mode));
    selection.active = Boolean(drag || keyboardMode || wheelFeedback);
    selection.direction = Math.abs(heightGap) > 0.001 ? Math.sign(heightGap) : 0;
    selection.paused = paused || completed;
    ui.setMode(selection.paused ? '' : selection.mode);
    const alpha = 1 - Math.exp(-CONFIG.movement.damping * delta);
    const positionGap = Math.abs(piece.height - piece.targetPosition.y)
      + Math.abs(mesh.position.x - piece.targetPosition.x)
      + Math.abs(mesh.position.z - piece.targetPosition.z);
    const moving = positionGap > 0.00001 || mesh.quaternion.angleTo(piece.targetRotation) > 0.00001;
    if (moving && !selection.paused) {
      currentPose.set(mesh.position.x, piece.height, mesh.position.z);
      nextPose.lerpVectors(currentPose, piece.targetPosition, alpha);
      nextRotation.slerpQuaternions(mesh.quaternion, piece.targetRotation, alpha);
      movement.constrain(currentPose, mesh.quaternion, nextPose, nextRotation);
      if (nextPose.distanceToSquared(currentPose) > 0 || !nextRotation.equals(mesh.quaternion)) {
        piece.height = nextPose.y;
        mesh.position.copy(nextPose);
        mesh.quaternion.copy(nextRotation);
        groundPiece(piece);
        shadows.invalidateShadows();
        scoreDirty = true;
      } else {
        piece.targetPosition.copy(currentPose);
        piece.targetRotation.copy(mesh.quaternion);
      }
    }
    scoreElapsed += delta;
    if (checkRequested || (scoreDirty && (!moving || scoreElapsed >= rules.interval))) {
      const currentMask = shadows.captureShadowMask();
      lastMatch = compareSilhouettes(targetMask, currentMask, rules);
      checkRequested = false;
      scoreElapsed = 0;
      scoreDirty = false;
    }
    if (!selection.paused && !document.hidden) {
      playTime += rawDelta;
      guideTime = Math.max(0, guideTime - rawDelta);
    }
    const similarity = lastMatch?.similarity ?? 0;
    if (similarity < rules.acceptance || scoreDirty || moving || selection.active) {
      settleTime = 0;
    } else if (!selection.paused && !document.hidden) {
      settleTime += delta;
      if (settleTime >= rules.holdTime) {
        completed = true;
        clearInput();
        updateMode();
        selection.paused = true;
      }
    }
    const near = similarity >= rules.nearMatch;
    const message = completed ? (assisted ? 'Solved with assistance' : 'Solved') :
      paused ? 'Paused' :
      similarity >= rules.acceptance ? 'Hold steady' :
      near ? 'Near match' :
      guideTime ? 'Follow the outline' : '';
    shadows.setGuideVisible(!completed && (near || guideTime > 0));
    ui.setProgress(lastMatch, message, completed, canAssist(), paused);
    view.renderSelection(selection, delta);
  });
}
