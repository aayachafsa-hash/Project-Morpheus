import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { MASK_RES, UPDATE_MS } from './ScoringConstants.js';
import { createTargetGuide } from '../scene/TargetGuide.js';
export function createShadowSystem({ renderer, scene, wall, pieces, piece, spotlight, invalidateRender }) {
  const s = CONFIG.scoring;
  const options = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const lightTarget = new THREE.WebGLRenderTarget(MASK_RES, MASK_RES, options);
  const wallTarget = new THREE.WebGLRenderTarget(MASK_RES, MASK_RES, options);
  const lightScene = new THREE.Scene(); lightScene.background = new THREE.Color(0);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
  const proxies = [];
  for (const p of pieces ?? [piece]) p.mesh.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let node = mesh; node; node = node.parent) if (node === p.outline) return;
    const proxy = new THREE.Mesh(mesh.geometry, white); proxy.matrixAutoUpdate = false;
    lightScene.add(proxy); proxies.push({ mesh, proxy });
  });
  const projector = new THREE.PerspectiveCamera(1, 1, .01, 1000);
  const camera = new THREE.OrthographicCamera(s.left, s.right, s.top, s.bottom, .01, 2000);
  // The imported projection wall is in XY. Oblique projector rays are reprojected
  // into this fixed wall space rather than compared in a perspective thumbnail.
  const wallZ = new THREE.Box3().setFromObject(wall, true).max.z;
  camera.position.set(0, 0, wallZ + 100); camera.lookAt(0, 0, wallZ);
  const projection = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    uniforms: { mask: { value: lightTarget.texture }, projectorMatrix: { value: projection } },
    vertexShader: `uniform mat4 projectorMatrix; varying vec4 beamUV;
      void main(){ vec4 world=modelMatrix*vec4(position,1.); beamUV=projectorMatrix*world;
      gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform sampler2D mask; varying vec4 beamUV;
      void main(){ vec3 ndc=beamUV.xyz/beamUV.w; vec2 uv=ndc.xy*.5+.5;
      bool valid=beamUV.w>0. && abs(ndc.x)<=1. && abs(ndc.y)<=1. && abs(ndc.z)<=1. && length(ndc.xy)<=1.;
      float value=valid ? step(.5,texture2D(mask,uv).r) : 0.; gl_FragColor=vec4(vec3(value),1.); }`,
    toneMapped: false,
  });
  const wallScene = new THREE.Scene(); wallScene.background = new THREE.Color(0);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.right-s.left, s.top-s.bottom), material);
  plane.position.set((s.left+s.right)/2, (s.bottom+s.top)/2, wallZ); wallScene.add(plane);
  let guide, pending = false, lastCapture = -Infinity, finished;
  const api = {
    async captureShadowMask(now = performance.now(), authoring = false) {
      if (pending || !authoring && now-lastCapture < UPDATE_MS) return null;
      pending = true;
      if(!authoring)lastCapture = now;
      let finish;
      finished=new Promise(resolve=>{finish=resolve;});
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      try {
        projector.position.copy(spotlight.getWorldPosition(new THREE.Vector3()));
        projector.lookAt(spotlight.target.getWorldPosition(new THREE.Vector3()));
        projector.fov = THREE.MathUtils.radToDeg(spotlight.angle*2);
        projector.updateProjectionMatrix(); projector.updateMatrixWorld(true);
        projection.multiplyMatrices(projector.projectionMatrix, projector.matrixWorldInverse);
        for (const {mesh, proxy} of proxies) {
          mesh.updateWorldMatrix(true, false); proxy.geometry=mesh.geometry; proxy.matrix.copy(mesh.matrixWorld); proxy.visible=mesh.visible;
        }
        renderer.autoClear=true;
        renderer.setRenderTarget(lightTarget); renderer.render(lightScene, projector);
        renderer.setRenderTarget(wallTarget); renderer.render(wallScene, camera);
        const pixels=new Uint8Array(MASK_RES*MASK_RES*4);
        const read=renderer.readRenderTargetPixelsAsync(wallTarget,0,0,MASK_RES,MASK_RES,pixels);
        renderer.setRenderTarget(previous); renderer.autoClear=autoClear;
        await read;
        return Uint8Array.from({length:MASK_RES*MASK_RES},(_,i)=>pixels[i*4]>=128 ? 1 : 0);
      } finally { renderer.setRenderTarget(previous); renderer.autoClear=autoClear; pending=false; finish(); }
    },
    async captureAuthoringMask(snapshot) {
      while(pending)await finished;
      const pose=snapshot();
      const mask=await api.captureShadowMask(performance.now(),true);
      return {pose,mask};
    },
    maskSpace:{width:MASK_RES,height:MASK_RES,left:s.left,right:s.right,bottom:s.bottom,top:s.top,wallZ},
    initializeGuide(mask) { if(guide){scene.remove(guide);guide.geometry.dispose();guide.material.dispose();} guide=createTargetGuide(mask,wall); scene.add(guide); },
    setGuideVisible(visible) { if(guide && guide.visible!==visible){guide.visible=visible;invalidateRender();} },
    invalidateShadows() { renderer.shadowMap.needsUpdate=true; invalidateRender(); },
    shadowsNeedUpdate() { return renderer.shadowMap.needsUpdate; },
  };
  return api;
}

