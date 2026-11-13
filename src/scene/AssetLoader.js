import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

export async function loadSceneAssets(scene, stoneNoise) {
  // The imported sculpture is a separate display, outside the puzzle mechanics.
  // Hide the entire display during shadow scoring so it cannot occlude the mask.
  const loader = new GLTFLoader();
  const importedDisplay = new THREE.Group();
  scene.add(importedDisplay);
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.88, 0.6, 64),
    new THREE.MeshStandardMaterial({ color: '#36332e', roughness: 0.75, metalness: 0.12 }),
  );
  stand.position.set(CONFIG.imported.position[0], 0.3, CONFIG.imported.position[2]);
  importedDisplay.add(stand);

  async function loadImportedSculpture() {
    const gltf = await loader.loadAsync(CONFIG.imported.url);
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
  // An expanded back-face shell draws a cyan silhouette, without extra shadow casters.
  const outline = new THREE.Mesh(fishGeometry, new THREE.MeshBasicMaterial({ color: CONFIG.colors.cyan, side: THREE.BackSide, toneMapped: false }));
  outline.scale.setScalar(1.015);
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
  return { importedDisplay, piece, loadImportedSculpture };
}
