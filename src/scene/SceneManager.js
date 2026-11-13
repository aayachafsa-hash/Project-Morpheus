import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createEnvironment } from './Environment.js';
import { addLighting } from './Lighting.js';
import { loadSceneAssets } from './AssetLoader.js';

export async function createScene(stage) {
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
  // Nothing animates except the puzzle piece. Update shadows only while they move.
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Interactive shadow puzzle');
  stage.append(canvas);
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 80);
  camera.position.fromArray(CONFIG.camera.position);
  camera.lookAt(new THREE.Vector3(...CONFIG.camera.target));

  const { wall, floor, stoneNoise } = createEnvironment(scene, renderer);
  addLighting(scene);
  const { importedDisplay, piece, loadImportedSculpture } = await loadSceneAssets(scene, stoneNoise);

  // Lightweight selection gizmo; it neither casts nor receives a shadow.
  const gizmo = new THREE.Group();
  const ringPoints = Array.from({ length: 81 }, (_, i) => new THREE.Vector3(Math.cos(i / 80 * Math.PI * 2) * 0.82, 0.025, Math.sin(i / 80 * Math.PI * 2) * 0.82));
  gizmo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), new THREE.LineBasicMaterial({ color: CONFIG.colors.cyan, transparent: true, opacity: 0.5, toneMapped: false })));
  scene.add(gizmo);

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? CONFIG.camera.portraitFov : CONFIG.camera.fov;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.rendering.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);

  return {
    canvas, camera, piece, resize, loadImportedSculpture,
    shadowScene: { renderer, scene, wall, floor, gizmo, importedDisplay, piece },
    setAnimationLoop(callback) { renderer.setAnimationLoop(callback); },
    renderSelection(piece) {
      gizmo.position.set(piece.mesh.position.x, CONFIG.table.y + piece.height, piece.mesh.position.z);
      renderer.render(scene, camera);
    },
  };
}
