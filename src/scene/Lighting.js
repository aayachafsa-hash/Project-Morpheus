import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CONFIG } from '../config.js';
import { DECORE_LIGHTS } from './DecoreLights.js';

function setWorld(scene, renderer, radiance) {
  scene.background = new THREE.Color().setRGB(...radiance, THREE.LinearSRGBColorSpace);
  const width = 256;
  const height = 128;
  const pixels = new Uint16Array(width * height * 4);
  const texel = [...radiance, 1].map(THREE.DataUtils.toHalfFloat);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(texel, i);
  const world = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  world.colorSpace = THREE.LinearSRGBColorSpace;
  world.mapping = THREE.EquirectangularReflectionMapping;
  world.minFilter = world.magFilter = THREE.LinearFilter;
  world.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(world).texture;
  scene.environmentIntensity = CONFIG.gallery.environmentIntensity;
  pmrem.dispose();
  world.dispose();
}

export function aimProjector(lens, wall) {
  const bounds = new THREE.Box3().setFromObject(wall, true);
  const { wallX, height } = CONFIG.projector;
  const target = new THREE.Vector3(
    THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, wallX),
    bounds.min.y + height,
    bounds.max.z,
  );
  const head = lens.parent;
  const parentSpace = head.parent.matrixWorld.clone().invert();
  const aim = target.clone().applyMatrix4(parentSpace).sub(head.position).normalize();
  const forward = new THREE.Vector3(-1, 0, 0).applyQuaternion(head.quaternion);
  head.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(forward, aim));
  const origin = lens.getWorldPosition(new THREE.Vector3()).lerp(target, CONFIG.maskLight.offset);
  return { origin, target, wallBounds: bounds };
}

function createDisplayLight(source, projectorAim) {
  const color = new THREE.Color().setRGB(...source.linearColor, THREE.LinearSRGBColorSpace);
  const warmTint = new THREE.Color(CONFIG.gallery.warmTint);
  // Normalize the sampled tint so warmth does not dim the existing rig.
  const luminance = 0.2126 * warmTint.r + 0.7152 * warmTint.g + 0.0722 * warmTint.b;
  warmTint.multiplyScalar(1 / luminance);
  color.multiply(new THREE.Color(1, 1, 1).lerp(warmTint, CONFIG.gallery.warmth));
  if (source.type === 'AREA') {
    const light = new THREE.RectAreaLight(color, source.intensity, source.width, source.height);
    if (source.name === 'Gallery | plaster wash') light.intensity *= CONFIG.gallery.plasterWash;
    const axes = source.rotationColumns.map(axis => new THREE.Vector3(...axis));
    light.position.fromArray(source.position);
    light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...axes));
    return light;
  }

  const light = new THREE.SpotLight(color, source.intensity, 0, source.angle, source.penumbra, 2);
  light.position.fromArray(source.position);
  light.target.position.copy(light.position).sub(new THREE.Vector3(...source.backward));
  // Only the projector needs a live shadow for the moving puzzle piece.
  if (source.name === 'Projector beam') {
    const { exposureEV, tint, angle, penumbra } = CONFIG.projector;
    light.color.set(tint);
    light.intensity *= 2 ** exposureEV;
    light.angle = angle;
    light.penumbra = penumbra;
    light.position.copy(projectorAim.origin);
    light.target.position.copy(projectorAim.target);
    light.castShadow = true;
    light.shadow.mapSize.setScalar(CONFIG.shadow.mapSize);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 24;
    light.shadow.bias = CONFIG.shadow.bias;
    light.shadow.radius = CONFIG.shadow.radius;
  }
  return light;
}

export function addLighting(scene, renderer, { lens, wall, piece }) {
  setWorld(scene, renderer, DECORE_LIGHTS.worldRadiance.map((channel, i) => channel * CONFIG.gallery.worldTint[i]));
  RectAreaLightUniformsLib.init();

  const projectorAim = aimProjector(lens, wall);
  const accent = CONFIG.projector.accent;
  const practical = new THREE.PointLight(accent.color, accent.intensity, accent.distance, 2);
  practical.name = 'Projector housing fill';
  practical.position.copy(lens.parent.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...accent.offset));
  scene.add(practical);
  const displaySpots = [];
  for (const source of DECORE_LIGHTS.lights) {
    const light = createDisplayLight(source, projectorAim);
    light.name = source.name;
    scene.add(light);
    if (light.isSpotLight) {
      displaySpots.push(light);
      scene.add(light.target);
    }
  }

  return { ...projectorAim, spotlight: scene.getObjectByName('Projector beam') };
}


