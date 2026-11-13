// All artistic and interaction settings live here. Units are arbitrary meters.
export const CONFIG = {
  colors: { background: '#0e0c0b', wall: '#c9b79c', floor: '#2a2826', stone: '#a9553b', cyan: '#5fe3ff' },
  light: { position: [-3.9, 1.15, 6.8], target: [0.8, 2.5, -4.8], color: '#ffdbb5', intensity: 440, angle: 0.68, penumbra: 0.9, distance: 30, decay: 2 },
  ambient: { color: '#e8ddd0', intensity: 0.32 },
  fill: { skyColor: '#d8d5cd', groundColor: '#776354', intensity: 0.85 },
  pointLights: [
    { color: '#ffdbb5', intensity: 55, distance: 16, position: [-4.5, 4.2, 2.5] },
    { color: '#cbd9ed', intensity: 32, distance: 15, position: [4.5, 3.8, 1.5] },
    { color: '#f4d4ab', intensity: 18, distance: 10, position: [-4.6, 2.8, -1.5] },
  ],
  imported: { url: new URL('./assets/models/airplane1.glb', import.meta.url).href, maxSize: 2, position: [-4.7, 0.62, -0.8], rotation: [0.08, 0.5, -0.12] },
  shadow: { mapSize: 4096, bias: -0.00008, normalBias: 0.008, near: 0.5, far: 24 },
  camera: { position: [2.5, 4.3, 14.8], target: [1.1, 1.3, -1.8], fov: 40, portraitFov: 58 },
  table: { width: 16, depth: 15, centerZ: 0.7, y: 0 },
  wall: { z: -4.8, width: 18, height: 8 },
  movement: { minX: -3.7, maxX: 3.7, minZ: -2.5, maxZ: 3.1, maxHeight: 4.5, heightSpeed: 0.015, damping: 18, rotateSpeed: 0.009, wheelSpeed: 0.004, clearance: 0.012 },
  material: { roughness: 0.78, stoneBump: 0.009, wallBump: 0.012, floorBump: 0.025 },
  rendering: { exposure: 1.05, maxPixelRatio: 1.5 },
  scoring: { width: 192, height: 96, interval: 0.3, threshold: 170, left: -4, right: 9, bottom: 0.05, top: 6.55 },
  puzzle: { url: new URL('./assets/models/aquafish.glb', import.meta.url).href, size: 2.2 },
  // The fish profile is on the mesh's XZ plane. Aim it toward the spotlight.
  solution: { x: -0.3, height: 1.35, z: 0, rotation: [-1.36, 0, -0.48] },
  initial: { x: -1.4, height: 0.2, z: 0.8, rotation: [0.35, 1.1, -0.4] },
};
