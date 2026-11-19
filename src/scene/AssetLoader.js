import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

export async function loadSceneAssets(scene, stoneNoise) {
  const loader = new GLTFLoader();

  // Load the real extracted mesh as the interactive puzzle piece.
  const puzzleAsset = await loader.loadAsync(CONFIG.puzzle.url);
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
  const mesh = new THREE.Mesh(fishGeometry, new THREE.MeshStandardMaterial({ color: CONFIG.colors.stone, roughness: CONFIG.material.roughness, bumpMap: stoneNoise, bumpScale: CONFIG.material.stoneBump }));
  mesh.name = 'AQUAFISH';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const outline = new THREE.Group();
  const { cyan, highlight } = CONFIG.selection;
  // Back faces expose only the silhouette. Wider transparent shells soften its edge.
  for (const [scale, color, opacity] of [[1.021, highlight, 1], [1.036, cyan, 0.28], [1.056, cyan, 0.10]]) {
    const shell = new THREE.Mesh(fishGeometry, new THREE.MeshBasicMaterial({
      color, opacity, side: THREE.BackSide, toneMapped: false,
      transparent: opacity < 1, depthWrite: opacity === 1,
      blending: opacity === 1 ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    shell.scale.setScalar(scale);
    outline.add(shell);
  }
  outline.visible = false;
  mesh.add(outline);
  scene.add(mesh);
  const piece = {
    mesh,
    outline,
    height: 0,
    targetPosition: new THREE.Vector3(),
    targetRotation: new THREE.Quaternion(),
  };
  return { piece };
}
