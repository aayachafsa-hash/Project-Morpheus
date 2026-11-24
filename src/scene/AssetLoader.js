import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

export async function loadPuzzleGeometry(level, manager) {
  if(level.format==='geometry'){
    const response=await fetch(level.mesh);
    if(!response.ok)throw new Error(`Could not load ${level.name} geometry`);
    const {positions,indices}=await response.json();
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    geometry.scale(level.scale,level.scale,level.scale);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
  const loader = new GLTFLoader(manager);

  // Legacy Aquafish is retained pending approval of its original replacement.
  const puzzleAsset = await loader.loadAsync(level.mesh);
  puzzleAsset.scene.updateMatrixWorld(true);
  const sourceMeshes = [];
  puzzleAsset.scene.traverse(object => { if (object.isMesh) sourceMeshes.push(object); });
  if (sourceMeshes.length !== 1) throw new Error('A level must contain one mesh.');
  const fishGeometry = sourceMeshes[0].geometry.clone();
  fishGeometry.applyMatrix4(sourceMeshes[0].matrixWorld);
  fishGeometry.computeBoundingBox();
  const fishSize = fishGeometry.boundingBox.getSize(new THREE.Vector3());
  const fishCenter = fishGeometry.boundingBox.getCenter(new THREE.Vector3());
  fishGeometry.translate(-fishCenter.x, -fishCenter.y, -fishCenter.z);
  const fishScale = level.scale / Math.max(fishSize.x, fishSize.y, fishSize.z);
  fishGeometry.scale(fishScale, fishScale, fishScale);
  fishGeometry.computeVertexNormals();
  const materials=new Set();
  const textures=new Set();
  puzzleAsset.scene.traverse(object=>{
    if(!object.isMesh)return;
    object.geometry.dispose();
    for(const material of [object.material].flat()){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  materials.forEach(material=>material.dispose());
  textures.forEach(texture=>texture.dispose());
  return fishGeometry;
}

export function replacePuzzleGeometry(piece, geometry, level) {
  const previous=piece.mesh.geometry;
  piece.mesh.geometry=geometry;
  piece.mesh.name=level.name.toUpperCase();
  for(const shell of piece.outline.children)shell.geometry=geometry;
  if(previous!==geometry)previous.dispose();
}

export async function loadSceneAssets(scene, stoneNoise, manager,level) {
  const fishGeometry=await loadPuzzleGeometry(level,manager);
  const mesh = new THREE.Mesh(fishGeometry, new THREE.MeshStandardMaterial({ color: CONFIG.colors.stone, roughness: CONFIG.material.roughness, bumpMap: stoneNoise, bumpScale: CONFIG.material.stoneBump }));
  mesh.name = level.name.toUpperCase();
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

