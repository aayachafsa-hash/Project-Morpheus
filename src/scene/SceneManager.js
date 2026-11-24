import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createEnvironment } from './Environment.js?room-glb';
import { addLighting } from './Lighting.js';
import { loadSceneAssets, loadPuzzleGeometry, replacePuzzleGeometry } from './AssetLoader.js';
import { createSelectionGizmo } from './SelectionGizmo.js';

import { createProjectorAtmosphere } from './ProjectorAtmosphere.js';
import { createFireflies } from './Fireflies.js';
import { createSolvedPulse } from './SolvedPulse.js';

export async function createScene(stage,onProgress=()=>{},initialLevel) {
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
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
  camera.position.fromArray(CONFIG.camera.position);
  camera.rotation.set(...CONFIG.camera.rotation, 'YXZ');

  onProgress(.06,'Loading the gallery');
  const manager=new THREE.LoadingManager();
  manager.onProgress=(_url,loaded,total)=>onProgress(.06+.64*loaded/Math.max(1,total),'Loading the gallery');
  const { wall, roomMeshesOutsideProjection, stoneNoise, lens, platform } = await createEnvironment(scene, renderer,manager);
  onProgress(.72,'Loading the first puzzle');
  const { piece } = await loadSceneAssets(scene, stoneNoise,manager,initialLevel);
  onProgress(.84,'Preparing light and atmosphere');
  piece.platform = platform;
  const { spotlight } = addLighting(scene, renderer, { lens, wall, piece });
  const atmosphere = createProjectorAtmosphere(spotlight, wall);
  scene.add(atmosphere.group);
  roomMeshesOutsideProjection.push(atmosphere.group);
  const fireflies = createFireflies(spotlight, lens, piece);
  scene.add(fireflies.group);
  roomMeshesOutsideProjection.push(fireflies.group);

  const solvedPulse = createSolvedPulse(piece, wall);
  scene.add(solvedPulse.overlay);
  roomMeshesOutsideProjection.push(solvedPulse.overlay);
  const { gizmo, update } = createSelectionGizmo(piece, camera);
  scene.add(gizmo);
  onProgress(.9,'Preparing the shadow puzzle');

  let needsRender = true;
  let wasAnimating = false;
  let lastMode;
  let lastActive;
  let lastDirection;
  let lastPaused;
  let atmosphereElapsed = 0;
  const invalidateRender = () => { needsRender = true; };
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    const { focalLength, sensorWidth, shift = [0, 0], fov = 45, minHorizontalFov = 0 } = CONFIG.camera;
    if (focalLength > 0 && sensorWidth > 0) {
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(sensorWidth / (2 * focalLength * camera.aspect)));
    } else {
      const horizontalHalfAngle = THREE.MathUtils.degToRad(minHorizontalFov / 2);
      const verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalHalfAngle) / camera.aspect));
      camera.fov = Math.max(fov, verticalFov);
    }
    camera.updateProjectionMatrix();
    // Blender's horizontal sensor fit uses sensor width for both shift axes.
    camera.projectionMatrix.elements[8] = 2 * shift[0];
    camera.projectionMatrix.elements[9] = 2 * shift[1] * camera.aspect;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const { maxPixelRatio, maxPixels } = CONFIG.rendering;
    renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio, Math.sqrt(maxPixels / (innerWidth * innerHeight))));
    renderer.setSize(innerWidth, innerHeight);
    needsRender = true;
  }
  resize();
  addEventListener('resize', resize);

  return {
    canvas, camera, piece, pieces: [piece], spotlight, resize, invalidateRender,
    prepareLevel(level){return loadPuzzleGeometry(level);},
    replaceLevel(geometry,level){replacePuzzleGeometry(piece,geometry,level);invalidateRender();},
    invalidateShadows() { renderer.shadowMap.needsUpdate = true; needsRender = true; },
    playSolvedPulse(mask) {
      if (solvedPulse.play(mask)) {
        needsRender = true;
        // Optional audio hook. Attach a listener to supply a soft chime.
        canvas.dispatchEvent(new CustomEvent('morpheus:solved-chime'));
      }
    },
    resetSolvedPulse() {
      solvedPulse.reset();
      needsRender = true;
    },
    shadowScene: { renderer, scene, wall, roomMeshesOutsideProjection, gizmo, piece, pieces: [piece], spotlight, invalidateRender },
    setAnimationLoop(callback) { renderer.setAnimationLoop(callback); },
    renderSelection(selection, delta, frozen = false) {
      const selectionChanged = selection.mode !== lastMode || selection.active !== lastActive ||
        selection.direction !== lastDirection || selection.paused !== lastPaused;
      const elapsed = frozen ? 0 : delta;
      const animating = update(selection, elapsed);
      const pulsing = !frozen && solvedPulse.update(delta);
      atmosphereElapsed += elapsed;
      const atmosphereFrame = !selection.paused && atmosphereElapsed >= 1 / CONFIG.atmosphere.idleFrameRate;
      if (!needsRender && !renderer.shadowMap.needsUpdate && !selectionChanged && !animating && !wasAnimating && !atmosphereFrame && !pulsing) return;
      atmosphere.update(selection.paused ? 0 : atmosphereElapsed, renderer, camera);
      fireflies.update(selection.paused ? 0 : atmosphereElapsed, renderer, camera, selection);
      atmosphereElapsed = 0;
      renderer.render(scene, camera);
      lastMode = selection.mode;
      lastActive = selection.active;
      lastDirection = selection.direction;
      lastPaused = selection.paused;
      wasAnimating = animating;
      needsRender = false;
    },
  };
}




