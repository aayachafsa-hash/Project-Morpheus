import * as THREE from 'three';
import { CONFIG } from '../config.js';

const up = new THREE.Vector3(0, 1, 0);
const down = new THREE.Vector3(0, -1, 0);
const forward = new THREE.Vector3(0, 0, -1);
const right = new THREE.Vector3(1, 0, 0);
const fullTurn = Math.PI * 2;

function guideMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, opacity, toneMapped: false, transparent: true,
    depthWrite: false, side: THREE.DoubleSide,
  });
}

function orbitBand(radius, width, material, start = 0, length = fullTurn) {
  const geometry = new THREE.RingGeometry(radius - width / 2, radius + width / 2, 96, 1, start, length);
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function arrow(geometry, material, direction) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(up, direction);
  return mesh;
}

export function createSelectionGizmo(piece, camera) {
  const { cyan, highlight } = CONFIG.selection;
  const gizmo = new THREE.Group();
  const ring = new THREE.Group();
  const orbit = new THREE.Group();
  const heightGuide = new THREE.Group();
  const planarGuide = new THREE.Group();
  const tiltGuide = new THREE.Group();
  gizmo.add(ring, heightGuide, planarGuide, tiltGuide);
  ring.add(orbit);

  const ringMaterial = guideMaterial(highlight, 0.76);
  const ringGlow = guideMaterial(cyan, 0.16);
  const orbitMaterial = guideMaterial(cyan, 0.96);
  ring.add(orbitBand(1, 0.015, ringMaterial), orbitBand(1, 0.056, ringGlow));

  const tipGeometry = new THREE.ConeGeometry(0.056, 0.15, 12);
  for (const angle of [0, Math.PI]) {
    const marker = new THREE.Group();
    marker.rotation.y = angle;
    const head = arrow(tipGeometry, orbitMaterial, forward);
    head.position.set(1, 0, 0);
    marker.add(orbitBand(1, 0.028, orbitMaterial, -0.47, 0.44), head);
    orbit.add(marker);
  }

  const guideGeometry = new THREE.CylinderGeometry(0.013, 0.013, 1, 8);
  const heightMaterial = guideMaterial(cyan);
  const riseMaterial = guideMaterial(highlight);
  const fallMaterial = guideMaterial(highlight);
  const heightLine = new THREE.Mesh(guideGeometry, heightMaterial);
  const rise = arrow(tipGeometry, riseMaterial, up);
  const fall = arrow(tipGeometry, fallMaterial, down);
  const anchor = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), heightMaterial);
  heightGuide.add(heightLine, rise, fall, anchor);

  const planarMaterial = guideMaterial(cyan);
  const planarLine = new THREE.Mesh(guideGeometry, planarMaterial);
  const planarStart = arrow(tipGeometry, planarMaterial, down);
  const planarEnd = arrow(tipGeometry, planarMaterial, up);
  planarGuide.add(planarLine, planarStart, planarEnd);

  const tiltMaterial = guideMaterial(cyan);
  const tiltArc = orbitBand(1, 0.020, tiltMaterial, 0.32, Math.PI * 0.78);
  tiltArc.rotation.x = Math.PI / 2;
  tiltArc.rotation.y = 0.26;
  tiltGuide.add(tiltArc);

  const dimensions = new THREE.Vector2();
  const toCamera = new THREE.Vector3();
  const planarAxis = new THREE.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let orbitAngle = 0;
  let heightOpacity = 0;
  let planarOpacity = 0;
  let tiltOpacity = 0;

  function update(selection, delta) {
    const { mode, active, paused, direction } = selection;
    const { mesh, platform, height, movement } = piece;
    movement.getDimensions(mesh.quaternion, dimensions);
    const base = platform.y + height + CONFIG.movement.clearance;
    gizmo.position.set(mesh.position.x, base, mesh.position.z);

    const blend = 1 - Math.exp(-16 * delta);
    const radius = Math.max(0.60, dimensions.x + 0.10);
    ring.position.y = 0.045;
    ring.scale.setScalar(radius);
    ringMaterial.opacity = paused ? 0.47 : mode === 'rotate' ? 0.98 : 0.76;
    orbitMaterial.opacity = paused ? 0.52 : 0.96;
    if (!paused && !reducedMotion.matches) {
      orbitAngle = (orbitAngle + delta * (mode === 'rotate' ? 1.65 : 0.82)) % fullTurn;
    }
    orbit.rotation.y = orbitAngle;

    const showHeight = !paused && (mode === 'height' || direction !== 0);
    heightOpacity = THREE.MathUtils.lerp(heightOpacity, showHeight ? 1 : 0, blend);
    heightGuide.visible = !paused && heightOpacity > 0.01;
    // Place the guide on the camera-facing edge so the piece can't hide the active cue.
    toCamera.copy(camera.position).sub(gizmo.position);
    toCamera.y = 0;
    toCamera.normalize().multiplyScalar(radius + 0.02);
    heightGuide.position.copy(toCamera);
    const bottom = 0.10 - height;
    const top = Math.max(0.65, dimensions.y * 0.78);
    heightLine.position.y = (top + bottom) / 2;
    heightLine.scale.y = top - bottom;
    anchor.position.y = bottom;
    rise.position.y = top;
    fall.position.y = bottom + 0.12;
    heightMaterial.opacity = heightOpacity * 0.84;
    riseMaterial.opacity = heightOpacity * (direction < 0 ? 0.46 : 1);
    fallMaterial.opacity = heightOpacity * (direction > 0 ? 0.46 : 1);

    const showPlanar = !paused && active && (mode === 'move' || mode === 'depth');
    planarOpacity = THREE.MathUtils.lerp(planarOpacity, showPlanar ? 1 : 0, blend);
    planarGuide.visible = !paused && planarOpacity > 0.01;
    planarMaterial.opacity = planarOpacity * 0.82;
    if (showPlanar) {
      planarAxis.copy(mode === 'depth' ? forward : right);
      planarGuide.quaternion.setFromUnitVectors(up, planarAxis);
    }
    planarGuide.position.set(0, 0.075, 0);
    planarLine.scale.y = radius * 2 + 0.56;
    planarStart.position.y = -radius - 0.30;
    planarEnd.position.y = radius + 0.30;

    const showTilt = !paused && active && mode === 'tilt';
    tiltOpacity = THREE.MathUtils.lerp(tiltOpacity, showTilt ? 1 : 0, blend);
    tiltGuide.visible = !paused && tiltOpacity > 0.01;
    tiltGuide.position.y = dimensions.y * 0.46;
    tiltGuide.scale.setScalar(radius);
    tiltMaterial.opacity = tiltOpacity * 0.72;
  }

  return { gizmo, update };
}
