import { UI_TEAL } from './ui/tokens.js';

// All artistic and interaction settings live here. Units are arbitrary meters.
export const CONFIG = {
  colors: { background: '#0e0c0b', wall: '#c9b79c', floor: '#2a2826', stone: '#a9553b', cyan: UI_TEAL },
  shadow: { mapSize: 1024, radius: 2.5, bias: -0.0002 },
  projector: {
    wallX: 0.55, height: 4.6, exposureEV: 5.55, tint: '#fff3e7', angle: 0.235 + Math.PI / 180, penumbra: 0.28,
    accent: { color: '#ffefdd', intensity: 3.5, distance: 3, offset: [-0.55, 0.9, 0.8] },
  },
  // Sampled Blender render tones: plaster #dab89d, reflected light #b49f8b.
  gallery: {
    worldTint: [1.28, 1.06, 0.40], environmentIntensity: 1.10, plasterWash: 0.80,
    warmTint: '#cd986d', warmth: 0.34,
  },
  // The scoring camera covers the full playfield around the projector axis.
  maskLight: { offset: 0.005, angle: 0.68, distance: 30 },
  maskShadow: { mapSize: 1024, radius: 1.25, bias: -0.00008, normalBias: 0.008, near: 0.5, far: 24 },
  // Active Reference viewport camera from Decore_1_v02.blend, converted to Y-up.
  camera: {
    position: [8.8815, 4.599, 23.935],
    rotation: [0.062832, 0.328122, -0.00000175],
    fov: 34.5,
    minHorizontalFov: 49,
  },
  table: { width: 16, depth: 15, centerZ: 0.7, y: 0 },
  wall: { z: -4.8, width: 18, height: 8 },
  movement: {
    maxHeight: 4.5, heightSpeed: 0.015, damping: 15, rotateSpeed: 0.009,
    wheelSpeed: 0.004, clearance: 0.012, keyMoveSpeed: 2.7, keyRotateSpeed: 1.8,
  },
  selection: { cyan: UI_TEAL, highlight: UI_TEAL },
  solvedPulse: {
    color: UI_TEAL, // Defaults to selection.cyan.
    peakIntensity: 5.2, attack: 0.15, decay: 0.6,
    shadowDelay: 0.2,
  },
  atmosphere: {
    beamOpacity: 0.26, color: '#fff0d8',
    dustCount: 180, driftSpeed: 0.18, dustOpacity: 0.68, dustSize: 0.055,
    idleFrameRate: 24,
  },
  fireflies: {
    count: 6, glowColor: '#e8ef8c', amberColor: '#ffd17c',
    pulseSpeed: 1.4, scatterRadius: 10.2, lightIntensity: 5.32,
    lightCount: 3, lightRange: 1.1, size: 10.2, keepOutMargin: 0.35,
    forwardDistance: 1.7, clusterRadius: 0.5, depthSpread: 0.6,
  },
  material: { roughness: 0.78, stoneBump: 0.009, wallBump: 0.012, floorBump: 0.025, marbleSpecular: 0.58 },
  rendering: { exposure: 1.16, maxPixelRatio: 1, maxPixels: 1920 * 1080 },
  scoring: {
    width: 256, height: 256, interval: 0.1, threshold: 128, left: -8, right: 8, bottom: 0, top: 9,
    edgeCredit: 0.5, nearMatch: 85, acceptance: 92, holdTime: 0.5,
    progressDots: [20, 40, 60, 75, 85],
    assistDelay: 30, assistAngle: 30, assistDistance: 0.4,
  },
  puzzle: {
    url: new URL('./assets/models/aquafish.glb', import.meta.url).href,
    referenceImage: new URL('./assets/textures/aquafish-reference.png', import.meta.url).href,
    targetMask: new URL('./assets/textures/aquafish-target-mask.png', import.meta.url).href,
    size: 2.2,
  },
  // Fit the atlas silhouette to this projector while keeping the fish in the lit part of the beam.
  solution: {
    x: 0.14, height: 1.15, z: -0.79,
    position: [-2.34327565, 3.3986825, 1.42429586],
    rotation: [-1.33490054, -0.08676867, -0.57300551],
  },
  initial: { x: -0.35, height: 0, z: 0.15, rotation: [0.35, 1.1, -0.4] },
};


