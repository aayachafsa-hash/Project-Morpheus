// Local duel: two players, one keyboard, one browser session, one shared target.
// NOT RUN YET: it depends on the scene contract below, which src/scene/ must provide.
//
// Contract expected from the scene (view):
//   view.stations = [station0, station1]   (exactly two)
//   station = {
//     piece,        // same shape as today's view.piece: { mesh, outline, platform, movement,
//                   //   targetPosition, targetRotation, height }
//     shadowScene,  // same shape as today's view.shadowScene, for THIS station:
//                   //   { renderer, scene, wall, roomMeshesOutsideProjection, gizmo, piece,
//                   //     bounds: { left, right, top, bottom }  // station-relative, equivalent size
//                   //     hide:   [otherStation.piece.mesh, otherStation.gizmo] }
//                   //     (the outline is a child of the mesh, so hiding the mesh hides it too)
//   }
//   view.renderStations(selections, delta)  // render once + update both selection highlights
//   view.resize(), view.setAnimationLoop(fn)  // already exist
//
// Optional UI hooks (agree with the UI owner), called only if they exist:
//   ui.setDuelState(state)   state = { phase, remaining, holds, holdTime, threshold,
//                                      roundId, paused, result, scores: [n, n], axes: ['Y', 'Y'] }
//   ui.showDuelResult(result)  result = { winners: number[], tie, replay }  (called once per round)
//   ui.setMatchState(match)  match = { mode, over, matchWinner, draw, roundsPlayed, roundsTotal,
//                                      scores: [n, n]   (classic totals: win 3 / draw 1 / lose 0),
//                                      points: [n, n]   (survival points left, null in classic),
//                                      wins, draws, losses: [n, n], history }  (from ScoreManager)
//
// Match mode comes from CONFIG.duel.match, overridable in the URL for tests:
//   ?mode=duel&match=survival   ?mode=duel&match=classic&rounds=5
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createShadowSystem } from './ShadowSystem.js';
import { createTargetMask } from './LevelManager.js';
import { compareSilhouettes } from './PuzzleValidator.js';
import { createInputManager } from './InputManager.js';
import { createPlayerController } from './PlayerController.js';
import { createRoundState } from './RoundState.js';
import { createScoreManager } from './ScoreManager.js';

export function startDuel(view, ui) {
  if (!view.stations || view.stations.length !== 2 || typeof view.renderStations !== 'function') {
    throw new Error('Duel needs view.stations (2 entries) and view.renderStations(). See the scene contract in LocalMultiplayer.js.');
  }
  const duel = CONFIG.duel;
  const rules = CONFIG.scoring;

  const stations = view.stations.map(station => {
    const shadows = createShadowSystem(station.shadowScene);
    const controller = createPlayerController(station.piece);
    controller.reset();
    return { piece: station.piece, shadows, controller, target: null, score: 0, active: false };
  });
  view.resize();

  // One target per station, built from the same solution pose. If the two stations are
  // equivalent, the two masks must be (almost) identical: log the difference as a check.
  for (const station of stations) {
    station.target = createTargetMask(station.piece, station.shadows);
    if (!station.target.some(Boolean)) throw new Error('A station target mask is empty. Check bounds and light.');
  }
  const [a, b] = [stations[0].target, stations[1].target];
  let differing = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union++;
    if (a[i] !== b[i]) differing++;
  }
  console.info(`[duel] target masks differ by ${(differing / Math.max(1, union) * 100).toFixed(2)}% of their union (0% = equivalent stations)`);

  const input = createInputManager({ bindings: duel.controls });
  const round = createRoundState({
    countdown: duel.countdown, threshold: duel.threshold, holdTime: duel.holdTime, tie: duel.tie,
  });

  const params = new URLSearchParams(location.search);
  const matchSettings = {
    ...duel.match,
    mode: params.get('match') ?? duel.match.mode,
    rounds: Number(params.get('rounds')) || duel.match.rounds,
  };
  const score = createScoreManager(matchSettings);

  function startRound() {
    if (score.getState().over) score.reset(); // a new match begins after a finished one
    if (!round.start()) return;
    input.setEnabled(false);
    for (const station of stations) {
      station.controller.reset();
      station.score = 0;
      station.shadows.invalidateShadows();
    }
    scoreElapsed = rules.interval;
  }

  // Temporary start control until the UI owner provides a button: Space starts or restarts a round.
  addEventListener('keydown', event => {
    const { phase } = round.getState();
    if (event.code === 'Space' && !event.repeat && (phase === 'idle' || phase === 'resolved')) {
      event.preventDefault();
      startRound();
    }
  });

  const clock = new THREE.Clock();
  let scoreElapsed = rules.interval;
  let announcedRound = -1;

  view.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const live = round.isInputEnabled();
    input.setEnabled(live);

    let stale = false;
    stations.forEach((station, player) => {
      for (const action of input.consumeActions(player)) {
        if (action === 'cycleAxis') station.controller.cycleAxis();
        // 'switchObject' does nothing yet: the Aquafish level has one piece per player.
      }
      station.active = live && station.controller.applyInput(input.getAxes(player), delta) !== '';
      if (station.controller.settle(delta).changed) {
        station.shadows.invalidateShadows();
        stale = true;
      }
    });

    // Both stations are scored from the same sample, at the same moment.
    scoreElapsed += delta;
    if (scoreElapsed >= rules.interval || stale) {
      for (const station of stations) {
        station.score = compareSilhouettes(station.target, station.shadows.captureShadowMask(), rules).similarity;
      }
      scoreElapsed = 0;
    }

    round.update(delta, stations.map(station => station.score));
    const state = round.getState();
    if (state.phase === 'resolved' && state.roundId !== announcedRound) {
      announcedRound = state.roundId;
      score.recordRound(state.result, state.roundId); // counted once per round
      ui.showDuelResult?.(state.result);
    }
    ui.setMatchState?.(score.getState());
    ui.setDuelState?.({
      ...state,
      scores: stations.map(station => station.score),
      axes: stations.map(station => station.controller.axisName),
    });

    view.renderStations(
      stations.map(station => ({ mode: 'move', active: station.active, direction: 0, paused: !live })),
      delta,
    );
  });

  return { startRound, round, score };
}