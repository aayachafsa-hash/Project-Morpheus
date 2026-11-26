import * as SCORING from '../gameplay/ScoringConstants.js';
import { createScoreTracker } from '../gameplay/PuzzleValidator.js';
import { createMatchState } from '../gameplay/MatchState.js';
import { createRotationController } from '../gameplay/RotationController.js';
import { createInputLayer } from '../gameplay/RotationInput.js';
import { LEVEL } from '../gameplay/PuzzleDefinition.js';
import { DUEL_PLAYERS } from '../gameplay/DuelControls.js';
import {
  DEFAULT_ROUNDS, ROUND_TIME_LIMIT_S, SIMULTANEOUS_MS, createDuelMatch, firstSolveAt, pickLevels, resolveRound,
} from '../gameplay/DuelRules.js';

export const COUNTDOWN_MS = 3000;
export const RESULT_DELAY_MS = 1100;
const GO_MS = 700;

/**
 * Orchestrates a split-screen Classic Duel: two pieces, two keyboards sets, two scoring pipelines, one puzzle per
 * round. It never touches solo state: the solo piece is only hidden while a duel is on screen.
 * Collaborators are injected so the flow can be tested without WebGL: view.duelRig, ui.duelHud, createShadows.
 */
export function createDuelSession({ view, flow, ui, settings, levels, loadMask, createShadows, random = Math.random }) {
  const rig = view.duelRig;
  let active = false, phase = 'idle';           // idle | countdown | round | roundEnd | error
  let match = null, order = [], roundIndex = 0, rounds = DEFAULT_ROUNDS;
  let players = null, level = null, target = null;
  let epoch = 0, countdownMs = 0, clockMs = 0, decideAt = null, resultTimer = 0;

  function ensurePlayers() {
    if (players) return;
    const surface = document.createElement('div');   // Duel is keyboard-only: the mouse never reaches a piece.
    players = DUEL_PLAYERS.map(definition => {
      const piece = rig.pieces[definition.id];
      const shadows = createShadows({ ...view.shadowScene, pieces: [piece], piece, invalidateRender: rig.invalidate });
      const controls = createRotationController({
        view: {
          pieces: [piece], canvas: surface, camera: rig.camera(definition.id), spotlight: view.spotlight,
          invalidateRender: rig.invalidate, invalidateShadows: rig.invalidate,
        },
        settings, bindings: definition.bindings, level: LEVEL, onInput() {}, onHint() {},
      });
      const input = createInputLayer(surface, action => controls.accept(action), settings, definition.bindings,
        { pieceCount: 1, isEnabled: () => phase === 'round' && flow.canSimulate });
      return {
        id: definition.id, name: definition.name, piece, shadows, controls, input, tracker: createScoreTracker(SCORING),
        pending: false, scoreAt: -Infinity, state: null, best: 0, solvedAt: null,
      };
    });
  }

  async function prepareRound(index) {
    const next = order[index];
    const [mask, image, geometry] = await Promise.all([loadMask(next.mask256), ui.prepareTarget(next), view.prepareLevel(next)]);
    if (rig.active) rig.setLevel(geometry, next); else rig.enter(geometry, next);
    ensurePlayers();
    rig.resetPieces(next);
    level = next; target = mask; epoch++;
    for (const player of players) {
      player.controls.reset(); player.tracker.reset();
      player.scoreAt = -Infinity; player.state = null; player.best = 0; player.solvedAt = null;
    }
    clockMs = 0; decideAt = null; countdownMs = COUNTDOWN_MS; phase = 'countdown';
    const hud = ui.duelHud;
    hud.setRound({ number: index + 1, total: match.totalRounds, levelName: next.name, image });
    hud.setScore(match.score); hud.setMatch(0, 0); hud.setSolved(false, false);
    hud.setTimer(ROUND_TIME_LIMIT_S); hud.setBanner(null); hud.setCountdown('3');
  }

  function sample(player, now) {
    if (player.pending || clockMs - player.scoreAt < SCORING.UPDATE_MS) return;
    player.pending = true; player.scoreAt = clockMs;
    const version = epoch, sampledAt = clockMs;
    player.shadows.captureShadowMask(now).then(mask => {
      if (!mask || version !== epoch || phase !== 'round') return;
      const result = player.tracker.push(target, mask, sampledAt);
      player.state = createMatchState(result, false);
      player.best = Math.max(player.best, player.state.displayPercent);
      if (result.justSolved && player.solvedAt == null) player.solvedAt = sampledAt;
    }).catch(error => {
      if (version !== epoch) return;
      phase = 'error';
      ui.showError(`Silhouette scoring failed: ${error.message}`);
    }).finally(() => { player.pending = false; });
  }

  function finishRound(timedOut) {
    const [p1, p2] = players;
    const solved = firstSolveAt(p1, p2) != null;
    timedOut = timedOut && !solved;
    const winner = resolveRound({ p1, p2, timedOut });
    if (!winner || !flow.go('solved')) return;
    phase = 'roundEnd';
    for (const player of players) player.input.clear();
    const record = {
      level: level.name, winner, timedOut,
      p1: { best: p1.best, solvedMs: p1.solvedAt }, p2: { best: p2.best, solvedMs: p2.solvedAt },
    };
    match.record(record);
    ui.duelHud.setScore(match.score);
    ui.duelHud.setBanner(winner === 'draw' ? 'Draw' : `${winner === 'p1' ? 'Player 1' : 'Player 2'} · round won`);
    const number = roundIndex + 1;
    resultTimer = setTimeout(() => {
      if (!active || phase !== 'roundEnd' || flow.state !== 'solved') return;
      ui.duelHud.setBanner(null);
      ui.showDuelRound({
        record, score: match.score, number, total: match.totalRounds, over: match.over,
        summary: match.over ? match.summary() : null,
      });
    }, RESULT_DELAY_MS);
  }

  function exit() {
    if (!active && !rig.active) return;
    clearTimeout(resultTimer);
    phase = 'idle'; active = false; epoch++;
    players?.forEach(player => player.input.clear());
    rig.exit();
    ui.setDuelMode(false);
  }

  async function begin(count) {
    clearTimeout(resultTimer);
    rounds = count; match = createDuelMatch(count); order = pickLevels(levels, count, random); roundIndex = 0;
    try {
      await prepareRound(0);
      active = true; ui.setDuelMode(true);
    } catch (error) { exit(); throw error; }
  }

  return {
    get active() { return active; },
    get rounds() { return rounds; },
    start: (count = rounds) => begin(count),
    restartMatch: () => begin(rounds),
    async nextRound() { clearTimeout(resultTimer); roundIndex++; await prepareRound(roundIndex); },
    async restartRound() { clearTimeout(resultTimer); await prepareRound(roundIndex); },
    exit,
    /** Called once per animation frame while a duel is on screen. */
    frame(dt, now = performance.now()) {
      if (!active) return;
      const live = flow.canSimulate;
      const hud = ui.duelHud;
      if (live && phase === 'countdown') {
        countdownMs -= dt * 1000;
        if (countdownMs > 0) hud.setCountdown(String(Math.ceil(countdownMs / 1000)));
        else { phase = 'round'; hud.setCountdown('Go'); }
      } else if (live && phase === 'round') {
        clockMs += dt * 1000;
        if (clockMs > GO_MS) hud.setCountdown(null);
        for (const player of players) player.input.update(dt);
        const [p1, p2] = players;
        const first = firstSolveAt(p1, p2);
        // After the first solve, keep scoring for one more tick so a simultaneous solve is a draw, not a coin flip.
        if (first != null && decideAt == null) decideAt = first + SIMULTANEOUS_MS;
        const timedOut = clockMs >= ROUND_TIME_LIMIT_S * 1000;
        const closing = decideAt != null ? clockMs >= decideAt : timedOut;
        if (!closing) for (const player of players) sample(player, now);
        // No new samples once closing, so the in-flight ones drain even on a slow machine; then decide.
        else if (!p1.pending && !p2.pending) finishRound(timedOut);
      }
      if (phase === 'round' || phase === 'roundEnd') {
        const [p1, p2] = players;
        hud.setMatch(p1.state?.displayPercent ?? 0, p2.state?.displayPercent ?? 0);
        hud.setSolved(p1.solvedAt != null, p2.solvedAt != null);
        hud.setTimer(Math.max(0, Math.ceil(ROUND_TIME_LIMIT_S - clockMs / 1000)));
      }
      rig.renderFrame(dt, !live);
    },
  };
}
