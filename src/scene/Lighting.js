import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function addLighting(scene) {
  scene.add(new THREE.AmbientLight(CONFIG.ambient.color, CONFIG.ambient.intensity));
  scene.add(new THREE.HemisphereLight(CONFIG.fill.skyColor, CONFIG.fill.groundColor, CONFIG.fill.intensity));
  for (const settings of CONFIG.pointLights) {
    const light = new THREE.PointLight(settings.color, settings.intensity, settings.distance, 2);
    light.position.fromArray(settings.position);
    light.castShadow = false;
    scene.add(light);
  }
  const spot = new THREE.SpotLight(CONFIG.light.color, CONFIG.light.intensity, CONFIG.light.distance, CONFIG.light.angle, CONFIG.light.penumbra, CONFIG.light.decay);
  spot.position.fromArray(CONFIG.light.position);
  spot.target.position.fromArray(CONFIG.light.target);
  spot.castShadow = true;
  spot.shadow.mapSize.set(CONFIG.shadow.mapSize, CONFIG.shadow.mapSize);
  spot.shadow.bias = CONFIG.shadow.bias;
  spot.shadow.normalBias = CONFIG.shadow.normalBias;
  spot.shadow.camera.near = CONFIG.shadow.near;
  spot.shadow.camera.far = CONFIG.shadow.far;
  scene.add(spot, spot.target);
}
