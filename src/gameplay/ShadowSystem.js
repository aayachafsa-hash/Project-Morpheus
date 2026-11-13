import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createShadowSystem({ renderer, scene, wall, floor, gizmo, importedDisplay, piece }) {
  // Score the actual spotlight shadow, not object positions or a fabricated value.
  // A temporary ShadowMaterial isolates the wall shadow in an offscreen buffer.
  // The piece remain shadow casters, but write no visible color/depth in this pass.
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
    const outlineVisible = piece.outline.visible;
    try {
      scene.background = whiteBackground;
      wall.material = shadowOnlyMaterial;
      floor.visible = false;
      gizmo.visible = false;
      importedDisplay.visible = false;
      piece.outline.visible = false;
      piece.mesh.material.colorWrite = false;
      piece.mesh.material.depthWrite = false;
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
      piece.outline.visible = outlineVisible;
      piece.mesh.material.colorWrite = true;
      piece.mesh.material.depthWrite = true;
    }
  }
  return {
    captureShadowMask,
    invalidateShadows() { renderer.shadowMap.needsUpdate = true; },
    shadowsNeedUpdate() { return renderer.shadowMap.needsUpdate; },
  };
}
