import * as THREE from 'three';
import { CONFIG } from '../config.js?shadow-progress';
import { createTargetGuide } from '../scene/TargetGuide.js';

// Duel additions (both optional, so Solo behaves exactly as before):
//   bounds : { left, right, top, bottom } overrides the wall area that is scored.
//            Each duel station scores its own part of the wall.
//   hide   : objects hidden only while the mask is captured (the other player's
//            mesh and gizmo), so they never count as shadow in this player's score.
export function createShadowSystem({ renderer, scene, wall, roomMeshesOutsideProjection, gizmo, piece, bounds = {}, hide = [] }) {
  // Score the actual spotlight shadow, not object positions or a fabricated value.
  // A temporary ShadowMaterial isolates the wall shadow in an offscreen buffer.
  // The piece remain shadow casters, but write no visible color/depth in this pass.
  const scoreSettings = { ...CONFIG.scoring, ...bounds };
  const scoreTarget = new THREE.WebGLRenderTarget(scoreSettings.width, scoreSettings.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const scorePixels = new Uint8Array(scoreSettings.width * scoreSettings.height * 4);
  const scoreCamera = new THREE.OrthographicCamera(scoreSettings.left, scoreSettings.right, scoreSettings.top, scoreSettings.bottom, 0.1, 40);
  scoreCamera.position.set(0, 0, 12);
  scoreCamera.lookAt(0, 0, CONFIG.wall.z);
  const shadowOnlyMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 1, toneMapped: false });
  const whiteBackground = new THREE.Color(0xffffff);
  const roomVisibility = roomMeshesOutsideProjection.map(() => true);
  let guide;
  function captureShadowMask() {
    const previousTarget = renderer.getRenderTarget();
    const background = scene.background;
    const material = wall.material;
    const gizmoVisible = gizmo.visible;
    const outlineVisible = piece.outline.visible;
    const guideVisible = guide?.visible;
    const hiddenBefore = hide.map(object => object.visible);
    try {
      scene.background = whiteBackground;
      wall.material = shadowOnlyMaterial;
      for (const [index, mesh] of roomMeshesOutsideProjection.entries()) {
        roomVisibility[index] = mesh.visible;
        mesh.visible = false;
      }
      gizmo.visible = false;
      piece.outline.visible = false;
      if (guide) guide.visible = false;
      for (const object of hide) object.visible = false;
      // Tells the scoring light which player is being captured (read by Lighting.js).
      scene.userData.captureKey = piece.mesh.uuid;
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
      for (const [index, mesh] of roomMeshesOutsideProjection.entries()) mesh.visible = roomVisibility[index];
      gizmo.visible = gizmoVisible;
      piece.outline.visible = outlineVisible;
      if (guide) guide.visible = guideVisible;
      hide.forEach((object, i) => { object.visible = hiddenBefore[i]; });
      piece.mesh.material.colorWrite = true;
      piece.mesh.material.depthWrite = true;
    }
  }
  return {
    captureShadowMask,
    initializeGuide(mask) {
      guide = createTargetGuide(mask, wall);
      scene.add(guide);
    },
    setGuideVisible(visible) { guide.visible = visible; },
    invalidateShadows() { renderer.shadowMap.needsUpdate = true; },
    shadowsNeedUpdate() { return renderer.shadowMap.needsUpdate; },
  };
}