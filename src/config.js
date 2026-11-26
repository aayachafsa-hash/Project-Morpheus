// All artistic and interaction settings live here. Units are arbitrary meters.
export const CONFIG = {
  colors: { background: '#0e0c0b', wall: '#c9b79c', floor: '#2a2826', stone: '#a9553b', cyan: '#5fe3ff' },
  shadow: { mapSize: 1024, radius: 2.5, bias: -0.0002 },
  projector: {
    wallX: 0.55, height: 4.6, exposureEV: 2.55, tint: '#ffead7', angle: 0.285, penumbra: 0.28,
    accent: { color: '#ffdfbd', intensity: 3.5, distance: 3, offset: [-0.55, 0.9, 0.8] },
  },
  gallery: { worldTint: [1.1, 1.025, 0.93], environmentIntensity: 1.08, plasterWash: 0.80 },
  // The scoring camera covers the full playfield around the projector axis.
  maskLight: { offset: 0.005, angle: 0.68, distance: 30 },
  maskShadow: { mapSize: 1024, radius: 1.25, bias: -0.00008, normalBias: 0.008, near: 0.5, far: 24 },
  // Decore_1.blend camera, framed to the full reference viewport.
  camera: {
    position: [3.5058, 4.5985, 18.725],
    rotation: [-0.1535868, 0.2303836, 0],
    fov: 45, minHorizontalFov: 56,
  },
  table: { width: 16, depth: 15, centerZ: 0.7, y: 0 },
  wall: { z: -4.8, width: 18, height: 8 },
  movement: {
    maxHeight: 4.5, heightSpeed: 0.015, damping: 18, rotateSpeed: 0.009,
    wheelSpeed: 0.004, clearance: 0.012, keyMoveSpeed: 2.7, keyRotateSpeed: 1.8,
  },
  selection: { cyan: '#24e3ff', highlight: '#b0f7ff' },
  material: { roughness: 0.78, stoneBump: 0.009, wallBump: 0.012, floorBump: 0.025, marbleSpecular: 0.58 },
  rendering: { exposure: 1.08, maxPixelRatio: 1, maxPixels: 1920 * 1080 },
  scoring: {
    width: 256, height: 144, interval: 0.2, threshold: 170, left: -8, right: 8, bottom: 0, top: 9,
    edgeCredit: 0.5, nearMatch: 85, acceptance: 92, holdTime: 0.5,
    progressDots: [20, 40, 60, 75, 85],
    assistDelay: 30, assistAngle: 30, assistDistance: 0.4,
  },
  puzzle: {
    url: new URL('./assets/models/aquafish.glb', import.meta.url).href,
    referenceImage: new URL('./assets/textures/aquafish-reference.png', import.meta.url).href,
    size: 2.2,
  },
  // Fit the atlas silhouette to this projector while keeping the fish in the lit part of the beam.
  solution: { x: 0.14, height: 1.15, z: -0.79, rotation: [-1.35, 0.02, -0.38] },
  initial: { x: -1.5, height: 0.55, z: -1.5, rotation: [0.35, 1.1, -0.4] },

  duel: {
    countdown: 3,
    threshold: 90,
    holdTime: 0.3,   // 0.3 s tenu, pour faciliter le jeu (décision d'équipe)
    tie: 'both',     // égalité sur un round : un point chacun (décision d'équipe)
    match: {
      mode: 'classic',
      rounds: 3,
      startingPoints: 5,                 // mode Survie, pas encore confirmé
      drawRule: 'draw',                  // total égal après les manches : match nul (décision d'équipe)
      points: { win: 3, draw: 1, lose: 0 }, // jamais de score négatif
    },
    controls: {
      p1: { left: 'KeyA', right: 'KeyD', forward: 'KeyW', back: 'KeyS', up: 'KeyR', down: 'KeyF',
            rotateLeft: 'KeyQ', rotateRight: 'KeyE', precision: 'ShiftLeft', cycleAxis: 'KeyT', switchObject: 'Tab' },
      p2: { left: 'ArrowLeft', right: 'ArrowRight', forward: 'ArrowUp', back: 'ArrowDown', up: 'KeyI', down: 'KeyK',
            rotateLeft: 'KeyJ', rotateRight: 'KeyL', precision: 'ShiftRight', cycleAxis: 'KeyO', switchObject: 'Enter' },
    },
  },
};
