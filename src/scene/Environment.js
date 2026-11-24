import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

const roomUrl = new URL('../assets/models/Morpheus-Room.glb', import.meta.url).href;
const textureDirectory = new URL('../assets/textures/', import.meta.url);

async function loadTexture(loader, name, colorSpace = THREE.NoColorSpace) {
  const texture = await loader.loadAsync(new URL(name + '.png', textureDirectory).href);
  texture.flipY = false;
  texture.colorSpace = colorSpace;
  return texture;
}

function copyTextureUV(texture, source) {
  texture.channel = source.channel;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
}

export async function createEnvironment(scene, renderer,manager) {
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
  const loader = new THREE.TextureLoader(manager);
  const [{ scene: room }, relief, rimColor, rimRoughness, marbleColor, marbleRoughness] = await Promise.all([
    new GLTFLoader(manager).loadAsync(roomUrl),
    loadTexture(loader, 'medusa-relief-normal'),
    loadTexture(loader, 'plate-rim-color', THREE.SRGBColorSpace),
    loadTexture(loader, 'plate-rim-roughness'),
    loadTexture(loader, 'marble-table-color', THREE.SRGBColorSpace),
    loadTexture(loader, 'marble-table-roughness'),
  ]);

  // GLTFLoader sanitizes Blender node names. The copper plate has multiple
  // material primitives, so the exported object resolves to a Group.
  function requireRoomObject(name) {
    const object = room.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
    if (!object) throw new Error(`Morpheus-Room.glb is missing the object "${name}".`);
    return object;
  }

  const wall = requireRoomObject('Limestone projection wall');
  const floor = requireRoomObject('Cube.001');
  const plate = requireRoomObject('Cylinder');
  const lens = requireRoomObject('Emissive Fresnel lens');

  floor.traverse(object => {
    if (!object.isMesh) return;
    const material = object.material;
    for (const texture of [marbleColor, marbleRoughness]) {
      // Blender bake covers UV -1 to 1.75 in both axes. glTF flips V.
      texture.channel = material.map.channel;
      texture.repeat.setScalar(1 / 2.75);
      texture.offset.set(1 / 2.75, 0.75 / 2.75);
    }
    material.map = marbleColor;
    material.roughnessMap = marbleRoughness;
    material.roughness = 1;
    material.specularIntensity = CONFIG.material.marbleSpecular;
    material.clearcoat = 0;
  });

  plate.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.name === 'Classic decorative wallpaper') {
        // Bake the Blender diffuse/AO mix and roughness ramp, keeping the
        // GLB's automap UVs, repeat transform and tangent-space normal.
        copyTextureUV(rimColor, material.map);
        copyTextureUV(rimRoughness, material.roughnessMap);
        material.map = rimColor;
        material.roughnessMap = rimRoughness;
        material.roughness = 1;
        continue;
      }
      if (material.name !== 'Morpheus | Medusa brushed copper') continue;
      // The GLB links the grayscale height image as both albedo and normal.
      material.color.setHex(0xb8693a);
      material.map = null;
      relief.channel = material.normalMap.channel;
      material.normalMap = relief;
      material.normalScale.setScalar(1);
      material.roughness = 0.35;
      material.metalness = 1;
      material.anisotropy = 0;
    }
  });

  room.updateMatrixWorld(true);
  const plateBounds = new THREE.Box3().setFromObject(plate, true);
  const floorBounds = new THREE.Box3().setFromObject(floor, true);
  const platform = {
    center: plateBounds.getCenter(new THREE.Vector3()),
    size: plateBounds.getSize(new THREE.Vector3()),
    y: plateBounds.max.y,
    floorY: floorBounds.max.y,
  };

  const roomMeshesOutsideProjection = [];
  room.traverse(object => {
    if (object.isLight) {
      // The runtime projector owns both the display and scoring shadows.
      object.visible = false;
    }
    if (!object.isMesh) return;
    // The small projector shadow map only tracks the moving puzzle piece.
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.name === 'Morpheus | Ivory glazed ceramic') {
        // The exported shader omitted Blender's procedural ivory color ramp.
        material.color.setRGB(0.667, 0.550, 0.370, THREE.LinearSRGBColorSpace);
      }
      // Keep the lens emission without the full-scene transmission pass.
      if (material.name === 'Morpheus | Fresnel optical glass' || material.name === 'Morpheus | Fresnel ridges') {
        material.transmission = 0;
      }
    }
    if (object !== wall) roomMeshesOutsideProjection.push(object);
  });
  scene.add(room);
  return { wall, lens, platform, roomMeshesOutsideProjection, stoneNoise: noiseTexture(17, 3) };
}
