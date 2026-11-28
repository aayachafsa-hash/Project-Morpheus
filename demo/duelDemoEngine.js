import * as THREE from 'three';
import { createDuelSession } from '../src/app/DuelSession.js';
import { createGameState } from '../src/app/GameState.js';
import { INPUT_DEFAULTS } from '../src/gameplay/RotationInput.js';

const demoLevels = [45, -45, 75].map(yaw => ({
  name: `Target yaw ${yaw}°`,
  yaw: THREE.MathUtils.degToRad(yaw),
}));
const targetMask = new Uint8Array(100).fill(1);
const yawAxis = new THREE.Vector3(0, 1, 0);

export function createDuelDemo({ duelHud, showDuelRound, showError, onFrame }) {
  const flow = createGameState();
  flow.go('mainMenu');

  const camera = new THREE.PerspectiveCamera();
  const spotlight = new THREE.Object3D();
  spotlight.position.z = 10;
  spotlight.target = new THREE.Object3D();
  const targetRotation = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const makePiece = () => ({
    mesh: new THREE.Object3D(),
    outline: new THREE.Group(),
    targetPosition: new THREE.Vector3(),
    targetRotation: new THREE.Quaternion(),
  });
  const pieces = { p1: makePiece(), p2: makePiece() };
  const rig = {
    active: false, pieces, camera: () => camera,
    enter() { this.active = true; },
    exit() { this.active = false; },
    setLevel() {},
    invalidate() {},
    resetPieces(level) {
      targetRotation.setFromAxisAngle(yawAxis, level.yaw);
      for (const { mesh, targetRotation } of Object.values(pieces)) {
        mesh.quaternion.identity();
        targetRotation.identity();
      }
    },
    renderFrame() {
      onFrame(Object.values(pieces).map(({ mesh }) =>
        Math.round(THREE.MathUtils.radToDeg(euler.setFromQuaternion(mesh.quaternion, 'YXZ').y))));
    },
  };

  const duel = createDuelSession({
    view: { duelRig: rig, spotlight, shadowScene: {}, prepareLevel: async () => null },
    flow,
    ui: { duelHud, showDuelRound, showError, prepareTarget: async () => null, setDuelMode() {} },
    settings: INPUT_DEFAULTS,
    levels: demoLevels,
    loadMask: async () => targetMask,
    createShadows: ({ piece }) => ({
      async captureShadowMask() {
        const error = THREE.MathUtils.radToDeg(piece.mesh.quaternion.angleTo(targetRotation));
        const matched = Math.max(0, 100 - Math.round(error));
        return new Uint8Array(targetMask.length).fill(1, 0, matched);
      },
    }),
  });

  return {
    async advance(action) {
      if (action === 'next') await duel.nextRound();
      else await duel.start(3);
      flow.go('playing');
    },
    frame(dt, now) { duel.frame(dt, now); },
  };
}
