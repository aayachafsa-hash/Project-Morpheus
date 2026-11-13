import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createEnvironment(scene, renderer) {
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
  return { wall, floor, stoneNoise };
}
