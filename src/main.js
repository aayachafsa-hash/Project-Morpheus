import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// All artistic and interaction settings live here. Units are arbitrary meters.
export const CONFIG = {
  colors: { background: '#0e0c0b', wall: '#c9b79c', floor: '#2a2826', stone: '#a9553b', cyan: '#5fe3ff' },
  light: { position: [-3.9, 1.15, 6.8], target: [0.8, 2.5, -4.8], color: '#ffdbb5', intensity: 440, angle: 0.68, penumbra: 0.9, distance: 30, decay: 2 },
  ambient: { color: '#e8ddd0', intensity: 0.32 },
  fill: { skyColor: '#d8d5cd', groundColor: '#776354', intensity: 0.85 },
  pointLights: [
    { color: '#ffdbb5', intensity: 55, distance: 16, position: [-4.5, 4.2, 2.5] },
    { color: '#cbd9ed', intensity: 32, distance: 15, position: [4.5, 3.8, 1.5] },
    { color: '#f4d4ab', intensity: 18, distance: 10, position: [-4.6, 2.8, -1.5] },
  ],
  imported: { url: './assets/airplane1.glb', maxSize: 2, position: [-4.7, 0.62, -0.8], rotation: [0.08, 0.5, -0.12] },
  shadow: { mapSize: 4096, bias: -0.00008, normalBias: 0.008, near: 0.5, far: 24 },
  camera: { position: [2.5, 4.3, 14.8], target: [1.1, 1.3, -1.8], fov: 40, portraitFov: 58 },
  table: { width: 16, depth: 15, centerZ: 0.7, y: 0 },
  wall: { z: -4.8, width: 18, height: 8 },
  movement: { minX: -3.7, maxX: 3.7, minZ: -2.5, maxZ: 3.1, maxHeight: 4.5, heightSpeed: 0.015, damping: 18, rotateSpeed: 0.009, wheelSpeed: 0.004, clearance: 0.012 },
  material: { roughness: 0.78, stoneBump: 0.009, wallBump: 0.012, floorBump: 0.025 },
  rendering: { exposure: 1.05, maxPixelRatio: 1.5 },
  scoring: { width: 192, height: 96, interval: 0.3, threshold: 170, left: -4, right: 9, bottom: 0.05, top: 6.55 },
  puzzle: { url: './assets/aquafish.glb', size: 2.2 },
  solution: [{ x: -0.3, height: 0.7, z: 0, rotation: [0, 0, 0] }],
  initial: [{ x: -1.4, height: 0.2, z: 0.8, rotation: [0.35, 1.1, -0.4] }],
};

const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.rendering.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.rendering.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Nothing animates except the puzzle pieces. Update shadows only while they move.
renderer.shadowMap.autoUpdate = false;
const canvas = renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', 'Interactive shadow puzzle');
stage.append(canvas);
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 80);
camera.position.fromArray(CONFIG.camera.position);
camera.lookAt(new THREE.Vector3(...CONFIG.camera.target));

// Deterministic, locally generated surface textures.
function noiseTexture(seed, repeat) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 256;
  const context = surface.getContext('2d');
  const pixels = context.createImageData(256, 256);
  let state = seed;
  for (let i = 0; i < pixels.data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = 105 + (state >>> 26);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(surface);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  // A bump map stores scalar data, so leave its colorSpace at NoColorSpace.
  return texture;
}
const stoneNoise = noiseTexture(17, 3);
const wallMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.colors.wall, roughness: 0.95, bumpMap: noiseTexture(29, 5), bumpScale: CONFIG.material.wallBump });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.wall.width, CONFIG.wall.height), wallMaterial);
wall.position.set(0, CONFIG.wall.height / 2, CONFIG.wall.z);
wall.receiveShadow = true;
scene.add(wall);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.table.width, CONFIG.table.depth), new THREE.MeshStandardMaterial({ color: CONFIG.colors.floor, roughness: 0.78, bumpMap: noiseTexture(91, 9), bumpScale: CONFIG.material.floorBump }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, CONFIG.table.y, CONFIG.table.centerZ);
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.AmbientLight(CONFIG.ambient.color, CONFIG.ambient.intensity));
scene.add(new THREE.HemisphereLight(CONFIG.fill.skyColor, CONFIG.fill.groundColor, CONFIG.fill.intensity));
for (const settings of CONFIG.pointLights) {
  const light = new THREE.PointLight(settings.color, settings.intensity, settings.distance, 2);
  light.position.fromArray(settings.position);
  light.castShadow = false;
  scene.add(light);
}
const spot = new THREE.SpotLight(CONFIG.light.color, CONFIG.light.intensity, CONFIG.light.distance, CONFIG.light.angle, CONFIG.light.penumbra, CONFIG.light.decay);
spot.position.fromArray(CONFIG.light.position);
spot.target.position.fromArray(CONFIG.light.target);
spot.castShadow = true;
spot.shadow.mapSize.set(CONFIG.shadow.mapSize, CONFIG.shadow.mapSize);
spot.shadow.bias = CONFIG.shadow.bias;
spot.shadow.normalBias = CONFIG.shadow.normalBias;
spot.shadow.camera.near = CONFIG.shadow.near;
spot.shadow.camera.far = CONFIG.shadow.far;
scene.add(spot, spot.target);

// The imported sculpture is a separate display, outside the puzzle mechanics.
// Hide the entire display during shadow scoring so it cannot occlude the mask.
const importedDisplay = new THREE.Group();
scene.add(importedDisplay);
const stand = new THREE.Mesh(
  new THREE.CylinderGeometry(0.8, 0.88, 0.6, 64),
  new THREE.MeshStandardMaterial({ color: '#36332e', roughness: 0.75, metalness: 0.12 }),
);
stand.position.set(CONFIG.imported.position[0], 0.3, CONFIG.imported.position[2]);
stand.castShadow = false;
stand.receiveShadow = false;
importedDisplay.add(stand);

async function loadImportedSculpture() {
  const gltf = await new GLTFLoader().loadAsync(CONFIG.imported.url);
  const sculpture = gltf.scene;
  const material = new THREE.MeshStandardMaterial({ color: '#b46d4c', roughness: 0.62, metalness: 0.1 });
  const oldMaterials = new Set();
  sculpture.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.computeVertexNormals();
    for (const old of Array.isArray(object.material) ? object.material : [object.material]) oldMaterials.add(old);
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  oldMaterials.forEach(old => old.dispose());
  const box = new THREE.Box3().setFromObject(sculpture);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = CONFIG.imported.maxSize / Math.max(size.x, size.y, size.z, 0.001);
  sculpture.scale.setScalar(scale);
  sculpture.position.copy(center).multiplyScalar(-scale);
  const pivot = new THREE.Group();
  pivot.add(sculpture);
  pivot.rotation.set(...CONFIG.imported.rotation);
  pivot.updateMatrixWorld(true);
  const rotatedBounds = new THREE.Box3().setFromObject(pivot);
  pivot.position.set(CONFIG.imported.position[0], CONFIG.imported.position[1] - rotatedBounds.min.y, CONFIG.imported.position[2]);
  pivot.name = 'Extracted airplane sculpture';
  importedDisplay.add(pivot);
}

// Load the real extracted mesh as the interactive puzzle piece.
const puzzleAsset = await new GLTFLoader().loadAsync(CONFIG.puzzle.url);
puzzleAsset.scene.updateMatrixWorld(true);
const sourceMeshes = [];
puzzleAsset.scene.traverse(object => { if (object.isMesh) sourceMeshes.push(object); });
if (sourceMeshes.length !== 1) throw new Error('Aquafish must contain one mesh.');
const fishGeometry = sourceMeshes[0].geometry.clone();
fishGeometry.applyMatrix4(sourceMeshes[0].matrixWorld);
fishGeometry.computeBoundingBox();
const fishSize = fishGeometry.boundingBox.getSize(new THREE.Vector3());
const fishCenter = fishGeometry.boundingBox.getCenter(new THREE.Vector3());
fishGeometry.translate(-fishCenter.x, -fishCenter.y, -fishCenter.z);
const fishScale = CONFIG.puzzle.size / Math.max(fishSize.x, fishSize.y, fishSize.z);
fishGeometry.scale(fishScale, fishScale, fishScale);
fishGeometry.computeVertexNormals();
const geometries = [fishGeometry];
const names = ['AQUAFISH'];
const pieces = geometries.map((geometry, index) => {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: CONFIG.colors.stone, roughness: CONFIG.material.roughness, flatShading: index === 1, bumpMap: stoneNoise, bumpScale: CONFIG.material.stoneBump }));
  mesh.name = names[index];
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // An expanded back-face shell draws a cyan silhouette, without extra shadow casters.
  const outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: CONFIG.colors.cyan, side: THREE.BackSide, toneMapped: false }));
  outline.scale.setScalar(1.015);
  outline.visible = false;
  mesh.add(outline);
  scene.add(mesh);
  return { mesh, outline, index, height: 0, targetPosition: new THREE.Vector3(), targetRotation: new THREE.Quaternion() };
});

// Height means clearance above the table, independent of rotation and depth.
// Zero rests on the table; positive height allows free vertical arrangement.
const vertex = new THREE.Vector3();
function groundPiece(piece, height = piece.height) {
  const vertices = piece.mesh.geometry.attributes.position;
  let minY = Infinity;
  for (let i = 0; i < vertices.count; i++) {
    vertex.fromBufferAttribute(vertices, i).applyQuaternion(piece.mesh.quaternion);
    minY = Math.min(minY, vertex.y);
  }
  piece.mesh.position.y = CONFIG.table.y - minY + CONFIG.movement.clearance + height;
}

// Lightweight selection gizmo; it neither casts nor receives a shadow.
const gizmo = new THREE.Group();
const ringPoints = Array.from({ length: 81 }, (_, i) => new THREE.Vector3(Math.cos(i / 80 * Math.PI * 2) * 0.82, 0.025, Math.sin(i / 80 * Math.PI * 2) * 0.82));
gizmo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), new THREE.LineBasicMaterial({ color: CONFIG.colors.cyan, transparent: true, opacity: 0.5, toneMapped: false })));
scene.add(gizmo);

let selected = 0, rotateMode = false, depthMode = false, drag = null, paused = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.table.y);
const hitPoint = new THREE.Vector3();
const deltaRotation = new THREE.Quaternion();
const yawAxis = new THREE.Vector3(0, 1, 0);
const tiltEuler = new THREE.Euler();

function select(index) {
  selected = index;
  pieces.forEach(piece => { piece.outline.visible = piece.index === index; });
  document.querySelectorAll('.slot').forEach((button, i) => {
    button.classList.toggle('selected', i === index);
    button.setAttribute('aria-pressed', String(i === index));
  });
  $('#selection-label').textContent = `0${index + 1} / ${names[index]}`;
  syncTransformControls();
}
function updateMode() {
  $('#mode-label').textContent = paused ? 'PAUSED' : depthMode ? 'HEIGHT / UP & DOWN' : rotateMode ? 'ROTATE MODE' : 'MOVE MODE';
  canvas.style.cursor = paused ? 'default' : drag ? 'grabbing' : depthMode ? 'ns-resize' : rotateMode ? 'ew-resize' : 'grab';
}
// Sliders edit the same damped targets as pointer controls, so every input
// produces live shadows and uses the existing floor-contact constraints.
function syncTransformControls() {
  const piece = pieces[selected];
  $('#height').value = piece.targetPosition.y;
  $('#height-value').value = piece.targetPosition.y.toFixed(2);
  $('#depth').value = piece.targetPosition.z;
  $('#depth-value').value = piece.targetPosition.z.toFixed(2);
  const euler = new THREE.Euler().setFromQuaternion(piece.targetRotation, 'XYZ');
  for (const axis of ['x', 'y', 'z']) {
    const degrees = Math.round(THREE.MathUtils.radToDeg(euler[axis]));
    $(`#rotation-${axis}`).value = degrees;
    $(`#rotation-${axis}-value`).value = `${degrees}°`;
  }
}
$('#depth').min = CONFIG.movement.minZ;
$('#height').max = CONFIG.movement.maxHeight;
$('#height').addEventListener('input', event => {
  if (paused) return;
  pieces[selected].targetPosition.y = Number(event.target.value);
  clampPosition(pieces[selected].targetPosition);
  syncTransformControls();
});
$('#depth').max = CONFIG.movement.maxZ;
$('#depth').addEventListener('input', event => {
  if (paused) return;
  pieces[selected].targetPosition.z = Number(event.target.value);
  clampPosition(pieces[selected].targetPosition);
  syncTransformControls();
});
for (const axis of ['x', 'y', 'z']) {
  $(`#rotation-${axis}`).addEventListener('input', event => {
    if (paused) return;
    const piece = pieces[selected];
    const euler = new THREE.Euler().setFromQuaternion(piece.targetRotation, 'XYZ');
    euler[axis] = THREE.MathUtils.degToRad(Number(event.target.value));
    piece.targetRotation.setFromEuler(euler);
    syncTransformControls();
  });
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
  pieces.forEach((piece, i) => {
    const initial = CONFIG.initial[i];
    piece.targetPosition.set(initial.x, initial.height, initial.z);
    piece.height = initial.height;
    piece.targetRotation.setFromEuler(new THREE.Euler(...initial.rotation));
    piece.mesh.position.copy(piece.targetPosition);
    piece.mesh.quaternion.copy(piece.targetRotation);
    groundPiece(piece);
  });
  rotateMode = false;
  depthMode = false;
  paused = false;
  $('#pause').setAttribute('aria-pressed', 'false');
  $('#pause-label').textContent = 'Pause';
  document.querySelectorAll('.transform-panel input').forEach(input => { input.disabled = false; });
  select(0);
  updateMode();
  renderer.shadowMap.needsUpdate = true;
  $('#feedback').textContent = 'Move and rotate Aquafish to match its target shadow.';
}

canvas.addEventListener('pointerdown', event => {
  if (paused || event.button !== 0 || drag) return;
  canvas.focus({ preventScroll: true });
  setRay(event);
  const intersection = raycaster.intersectObjects(pieces.map(piece => piece.mesh), false)[0];
  if (intersection) select(pieces.findIndex(piece => piece.mesh === intersection.object));
  if (!raycaster.ray.intersectPlane(tablePlane, hitPoint)) return;
  const position = pieces[selected].targetPosition;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: position.x - hitPoint.x, offsetZ: position.z - hitPoint.z };
  canvas.setPointerCapture(event.pointerId);
  updateMode();
});
canvas.addEventListener('pointermove', event => {
  if (paused || !drag || event.pointerId !== drag.id) return;
  const piece = pieces[selected];
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (event.shiftKey) {
    tiltEuler.set(dy * CONFIG.movement.rotateSpeed, 0, -dx * CONFIG.movement.rotateSpeed);
    deltaRotation.setFromEuler(tiltEuler);
    piece.targetRotation.premultiply(deltaRotation).normalize();
  } else if (depthMode) {
    piece.targetPosition.y -= dy * CONFIG.movement.heightSpeed;
    clampPosition(piece.targetPosition);
  } else if (rotateMode) {
    deltaRotation.setFromAxisAngle(yawAxis, dx * CONFIG.movement.rotateSpeed);
    piece.targetRotation.premultiply(deltaRotation).normalize();
  } else {
    setRay(event);
    if (raycaster.ray.intersectPlane(tablePlane, hitPoint)) {
      piece.targetPosition.x = hitPoint.x + drag.offsetX;
      piece.targetPosition.z = hitPoint.z + drag.offsetZ;
      clampPosition(piece.targetPosition);
    }
  }
  drag.x = event.clientX;
  drag.y = event.clientY;
  syncTransformControls();
  // Re-anchor continuously so changing modifiers does not make the object jump.
  setRay(event);
  if (raycaster.ray.intersectPlane(tablePlane, hitPoint)) {
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
  const piece = pieces[selected];
  const before = piece.targetPosition.z;
  piece.targetPosition.z += THREE.MathUtils.clamp(pixels, -160, 160) * CONFIG.movement.wheelSpeed;
  clampPosition(piece.targetPosition);
  syncTransformControls();
  if (drag) drag.offsetZ += piece.targetPosition.z - before;
}, { passive: false });
addEventListener('keydown', event => {
  if (paused) return;
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'KeyR' && !event.repeat) { rotateMode = !rotateMode; depthMode = false; updateMode(); }
  if (event.code === 'KeyZ' && !event.repeat) { depthMode = !depthMode; rotateMode = false; updateMode(); }
  if (event.code === 'Escape') { depthMode = rotateMode = false; updateMode(); }
  const number = Number(event.key);
  if (!drag && number >= 1 && number <= pieces.length) { event.preventDefault(); select(number - 1); }
});
document.querySelectorAll('.slot').forEach(button => button.addEventListener('click', () => { if (!drag) select(Number(button.dataset.object)); }));
$('#reset').addEventListener('click', reset);
$('#show-solution').addEventListener('click', () => {
  if (paused) return;
  if (drag) endDrag({ pointerId: drag.id });
  pieces.forEach((piece, i) => {
    const pose = CONFIG.solution[i];
    piece.targetPosition.set(pose.x, pose.height, pose.z);
    piece.targetRotation.setFromEuler(new THREE.Euler(...pose.rotation));
  });
  syncTransformControls();
  $('#feedback').textContent = 'Aquafish solution. Reset to try matching the shadow yourself.';
});
$('#pause').addEventListener('click', () => {
  paused = !paused;
  if (drag) endDrag({ pointerId: drag.id });
  $('#pause').setAttribute('aria-pressed', String(paused));
  $('#pause-label').textContent = paused ? 'Resume' : 'Pause';
  document.querySelectorAll('.transform-panel input').forEach(input => { input.disabled = paused; });
  updateMode();
});
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? CONFIG.camera.portraitFov : CONFIG.camera.fov;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.rendering.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  $('#error').hidden = false;
  $('#error').textContent = 'Graphics context lost. Reload the page to restart.';
});

// Score the actual spotlight shadow, not object positions or a fabricated value.
// A temporary ShadowMaterial isolates the wall shadow in an offscreen buffer.
// The pieces remain shadow casters, but write no visible color/depth in this pass.
const scoreSettings = CONFIG.scoring;
const scoreTarget = new THREE.WebGLRenderTarget(scoreSettings.width, scoreSettings.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const scorePixels = new Uint8Array(scoreSettings.width * scoreSettings.height * 4);
const scoreCamera = new THREE.OrthographicCamera(scoreSettings.left, scoreSettings.right, scoreSettings.top, scoreSettings.bottom, 0.1, 40);
scoreCamera.position.set(0, 0, 12);
scoreCamera.lookAt(0, 0, CONFIG.wall.z);
const shadowOnlyMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 1, toneMapped: false });
const whiteBackground = new THREE.Color(0xffffff);
function captureShadowMask() {
  const previousTarget = renderer.getRenderTarget();
  const background = scene.background;
  const material = wall.material;
  const gizmoVisible = gizmo.visible;
  const displayVisible = importedDisplay.visible;
  const outlineVisibility = pieces.map(piece => piece.outline.visible);
  try {
    scene.background = whiteBackground;
    wall.material = shadowOnlyMaterial;
    floor.visible = false;
    gizmo.visible = false;
    importedDisplay.visible = false;
    pieces.forEach(piece => {
      piece.outline.visible = false;
      piece.mesh.material.colorWrite = false;
      piece.mesh.material.depthWrite = false;
    });
    renderer.setRenderTarget(scoreTarget);
    renderer.render(scene, scoreCamera);
    renderer.readRenderTargetPixels(scoreTarget, 0, 0, scoreSettings.width, scoreSettings.height, scorePixels);
    const mask = new Uint8Array(scoreSettings.width * scoreSettings.height);
    for (let i = 0; i < mask.length; i++) mask[i] = scorePixels[i * 4] < scoreSettings.threshold ? 1 : 0;
    return mask;
  } finally {
    renderer.setRenderTarget(previousTarget);
    scene.background = background;
    wall.material = material;
    floor.visible = true;
    gizmo.visible = gizmoVisible;
    importedDisplay.visible = displayVisible;
    pieces.forEach((piece, i) => {
      piece.outline.visible = outlineVisibility[i];
      piece.mesh.material.colorWrite = true;
      piece.mesh.material.depthWrite = true;
    });
  }
}

function createTargetMask() {
  const saved = pieces.map(piece => ({ position: piece.mesh.position.clone(), rotation: piece.mesh.quaternion.clone() }));
  pieces.forEach((piece, i) => {
    const pose = CONFIG.solution[i];
    piece.mesh.position.set(pose.x, 0, pose.z);
    piece.mesh.quaternion.setFromEuler(new THREE.Euler(...pose.rotation));
    groundPiece(piece, pose.height);
  });
  renderer.shadowMap.needsUpdate = true;
  const target = captureShadowMask();
  pieces.forEach((piece, i) => {
    piece.mesh.position.copy(saved[i].position);
    piece.mesh.quaternion.copy(saved[i].rotation);
  });
  renderer.shadowMap.needsUpdate = true;
  const context = $('#target').getContext('2d');
  const image = context.createImageData(scoreSettings.width, scoreSettings.height);
  for (let y = 0; y < scoreSettings.height; y++) {
    for (let x = 0; x < scoreSettings.width; x++) {
      const value = target[(scoreSettings.height - 1 - y) * scoreSettings.width + x];
      const offset = (y * scoreSettings.width + x) * 4;
      const rgb = value ? [30, 28, 25] : [230, 216, 190];
      image.data.set([...rgb, 255], offset);
    }
  }
  context.putImageData(image, 0, 0);
  // Crop only the HUD thumbnail for readability. IoU always uses the entire
  // fixed wall rectangle, so translation/depth cannot game the score.
  const preview = document.createElement('canvas');
  preview.width = scoreSettings.width;
  preview.height = scoreSettings.height;
  preview.getContext('2d').putImageData(image, 0, 0);
  let minX = scoreSettings.width, maxX = 0, minY = scoreSettings.height, maxY = 0;
  for (let y = 0; y < scoreSettings.height; y++) for (let x = 0; x < scoreSettings.width; x++) {
    if (target[(scoreSettings.height - 1 - y) * scoreSettings.width + x]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX + 1, height = maxY - minY + 1;
  const scale = Math.min((preview.width - 24) / width, (preview.height - 24) / height);
  context.fillStyle = '#e6d8be';
  context.fillRect(0, 0, preview.width, preview.height);
  context.drawImage(preview, minX, minY, width, height, (preview.width - width * scale) / 2, (preview.height - height * scale) / 2, width * scale, height * scale);
  return target;
}

let checkRequested = false;
$('#check').addEventListener('click', () => { checkRequested = true; });
reset();
resize();
const targetMask = createTargetMask();
if (!targetMask.some(Boolean)) throw new Error('The target shadow mask is empty. Check the light and scoring bounds.');
const clock = new THREE.Clock();
let readoutElapsed = 0, scoreElapsed = CONFIG.scoring.interval;
let frameCount = 0, frameTime = 0, lastMatch = 0;
let scoreDirty = true;
renderer.setAnimationLoop(() => {
  if (renderer.shadowMap.needsUpdate) scoreDirty = true;
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);
  frameCount++;
  frameTime += rawDelta;
  if (frameTime >= 1) {
    $('#performance').textContent = `${Math.round(frameCount / frameTime)} FPS`;
    frameCount = 0;
    frameTime = 0;
  }
  const alpha = 1 - Math.exp(-CONFIG.movement.damping * delta);
  for (const piece of pieces) {
    const mesh = piece.mesh;
    const moving = Math.abs(piece.height - piece.targetPosition.y) + Math.abs(mesh.position.x - piece.targetPosition.x) + Math.abs(mesh.position.z - piece.targetPosition.z) > 0.00001 || mesh.quaternion.angleTo(piece.targetRotation) > 0.00001;
    if (moving && !paused) {
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, piece.targetPosition.x, alpha);
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, piece.targetPosition.z, alpha);
      piece.height = THREE.MathUtils.lerp(piece.height, piece.targetPosition.y, alpha);
      mesh.quaternion.slerp(piece.targetRotation, alpha);
      groundPiece(piece);
      renderer.shadowMap.needsUpdate = true;
      scoreDirty = true;
    }
  }
  scoreElapsed += delta;
  if (checkRequested || (scoreDirty && scoreElapsed >= CONFIG.scoring.interval)) {
    const currentMask = captureShadowMask();
    let intersection = 0, union = 0;
    for (let i = 0; i < targetMask.length; i++) {
      intersection += targetMask[i] & currentMask[i];
      union += targetMask[i] | currentMask[i];
    }
    lastMatch = union ? Math.round(intersection / union * 100) : 0;
    $('#match').textContent = `${lastMatch}%`;
    if (checkRequested) $('#feedback').textContent = lastMatch >= 95 ? 'Target matched.' : `${lastMatch}% overlap. Keep adjusting.`;
    checkRequested = false;
    scoreElapsed = 0;
    scoreDirty = false;
  }
  gizmo.position.set(pieces[selected].mesh.position.x, CONFIG.table.y + pieces[selected].height, pieces[selected].mesh.position.z);
  readoutElapsed += delta;
  if (readoutElapsed > 0.1) {
    const mesh = pieces[selected].mesh;
    const degrees = THREE.MathUtils.radToDeg(mesh.rotation.y);
    $('#status').textContent = `Height ${pieces[selected].height.toFixed(2)} · Depth ${(mesh.position.z - CONFIG.wall.z).toFixed(2)} · Turn ${degrees.toFixed(0)}°`;
    readoutElapsed = 0;
  }
  renderer.render(scene, camera);
});
$('#status').textContent = 'Real-time shadows · Aquafish';
loadImportedSculpture().catch(error => {
  console.error('Could not load the extracted airplane mesh:', error);
  $('#error').hidden = false;
  $('#error').textContent = 'The airplane mesh could not load. Check assets/airplane1.glb and run this page through a local HTTP server.';
});
