import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createEnvironment } from './Environment.js?room-glb';
import { addLighting } from './Lighting.js';
import { loadSceneAssets } from './AssetLoader.js';
import { createSelectionGizmo } from './SelectionGizmo.js';
import { createPieceMovement } from '../gameplay/PieceMovement.js';

export async function createScene(stage) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = CONFIG.rendering.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The selection animates independently of the puzzle's shadow map.
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Interactive shadow puzzle');
  stage.append(canvas);
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 80);
  camera.position.fromArray(CONFIG.camera.position);
  camera.rotation.set(...CONFIG.camera.rotation, 'YXZ');

  const { wall, roomMeshesOutsideProjection, stoneNoise, lens, platform } = await createEnvironment(scene, renderer);
  const { piece } = await loadSceneAssets(scene, stoneNoise);
  piece.platform = platform;
  addLighting(scene, renderer, { lens, wall, piece });
  piece.movement = createPieceMovement(piece);
  const { gizmo, update } = createSelectionGizmo(piece, camera);
  scene.add(gizmo);

  let needsRender = true;
  let wasPaused = false;
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    const halfAngle = THREE.MathUtils.degToRad(CONFIG.camera.minHorizontalFov / 2);
    const verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfAngle) / camera.aspect));
    camera.fov = Math.max(CONFIG.camera.fov, verticalFov);
    camera.updateProjectionMatrix();
    const { maxPixelRatio, maxPixels } = CONFIG.rendering;
    renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio, Math.sqrt(maxPixels / (innerWidth * innerHeight))));
    renderer.setSize(innerWidth, innerHeight);
    needsRender = true;
  }
  resize();
  addEventListener('resize', resize);

  return {
    canvas, camera, piece, resize,
    shadowScene: { renderer, scene, wall, roomMeshesOutsideProjection, gizmo, piece },
    setAnimationLoop(callback) { renderer.setAnimationLoop(callback); },
    renderSelection(selection, delta) {
      if (selection.paused && wasPaused && !needsRender && !renderer.shadowMap.needsUpdate) return;
      update(selection, delta);
      renderer.render(scene, camera);
      wasPaused = selection.paused;
      needsRender = false;
    },
  };
}
