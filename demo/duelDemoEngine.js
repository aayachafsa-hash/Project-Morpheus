// DEMO ONLY. Duel logic running with a SIMULATED score instead of real shadows.
// It uses the real modules (InputManager, PlayerController, RoundState, ScoreManager) and the
// same loop order as LocalMultiplayer.js. The only difference: the score of a player is
// computed from how close the piece is to a demo target pose (position + turn around Y).
// It proves keyboard -> movement -> round -> match. It does NOT test shadows or the scene.
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { createInputManager } from '../src/gameplay/InputManager.js';
import { createPlayerController } from '../src/gameplay/PlayerController.js';
import { createRoundState } from '../src/gameplay/RoundState.js';
import { createScoreManager } from '../src/gameplay/ScoreManager.js';

// Demo-only poses, isolated from CONFIG.solution / CONFIG.initial.
export const DEMO_TARGET = { x: 0.6, height: 1.0, z: -0.4, yaw: 0.9 };
export const DEMO_START = { x: -1.2, height: 0.4, z: 0.6, yaw: -0.5 };
const UP = new THREE.Vector3(0, 1, 0);

function createDemoPiece() {
  return {
    mesh: new THREE.Object3D(),
    height: 0,
    targetPosition: new THREE.Vector3(),
    targetRotation: new THREE.Quaternion(),
    platform: { center: new THREE.Vector3(), y: 0 },
    movement: { constrain() {}, groundHeight: (_rotation, height) => height },
  };
}

function placeAtStart(piece) {
  const rotation = new THREE.Quaternion().setFromAxisAngle(UP, DEMO_START.yaw);
  piece.height = DEMO_START.height;
  piece.targetPosition.set(DEMO_START.x, DEMO_START.height, DEMO_START.z);
  piece.targetRotation.copy(rotation);
  piece.mesh.position.set(DEMO_START.x, DEMO_START.height, DEMO_START.z);
  piece.mesh.quaternion.copy(rotation);
}

export function demoScore(piece) {
  const dx = piece.mesh.position.x - DEMO_TARGET.x;
  const dy = piece.height - DEMO_TARGET.height;
  const dz = piece.mesh.position.z - DEMO_TARGET.z;
  const yaw = new THREE.Euler().setFromQuaternion(piece.mesh.quaternion, 'YXZ').y;
  let turn = Math.abs(yaw - DEMO_TARGET.yaw) % (Math.PI * 2);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  return Math.max(0, 100 - 40 * Math.hypot(dx, dy, dz) - 20 * turn);
}

export function createDuelDemo({ target = globalThis, onState = () => {} } = {}) {
  const duel = CONFIG.duel;
  const input = createInputManager({ bindings: duel.controls, target });
  const round = createRoundState({
    countdown: duel.countdown, threshold: duel.threshold, holdTime: duel.holdTime, tie: duel.tie,
  });
  const match = createScoreManager(duel.match);
  const stations = [0, 1].map(() => {
    const piece = createDemoPiece();
    return { piece, controller: createPlayerController(piece), score: 0, active: false };
  });
  let announcedRound = -1;

  function resetStations() {
    for (const station of stations) {
      station.controller.reset();
      placeAtStart(station.piece);
      station.score = demoScore(station.piece);
      station.active = false;
    }
  }
  resetStations();

  function snapshot() {
    return {
      round: round.getState(),
      match: match.getState(),
      scores: stations.map(station => station.score),
      poses: stations.map(({ piece }) => ({ x: piece.mesh.position.x, y: piece.height, z: piece.mesh.position.z })),
      axes: stations.map(station => station.controller.axisName),
      active: stations.map(station => station.active),
    };
  }

  return {
    stations, input, round, match,
    startRound() {
      if (match.getState().over) match.reset(); // a new match after a finished one
      if (!round.start()) return false;
      input.setEnabled(false);
      resetStations();
      onState(snapshot());
      return true;
    },
    tick(rawDelta) {
      const delta = Math.min(rawDelta, 0.05);
      const live = round.isInputEnabled();
      input.setEnabled(live);
      stations.forEach((station, player) => {
        for (const action of input.consumeActions(player)) {
          if (action === 'cycleAxis') station.controller.cycleAxis();
        }
        station.active = live && station.controller.applyInput(input.getAxes(player), delta) !== '';
        station.controller.settle(delta);
        station.score = demoScore(station.piece);
      });
      round.update(delta, stations.map(station => station.score));
      const state = round.getState();
      if (state.phase === 'resolved' && state.roundId !== announcedRound) {
        announcedRound = state.roundId;
        match.recordRound(state.result, state.roundId); // counted once per round
      }
      onState(snapshot());
    },
    dispose() { input.dispose(); },
  };
}
