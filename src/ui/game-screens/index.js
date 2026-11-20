// MORPHEUS UI, Step 3: the individual game screens (boot, main menu, level select, settings, pause, results).
//
//   import { createScreenManager } from '../index.js';
//   import { registerGameScreens, createSettingsStore } from './game-screens/index.js';
//   const settings = createSettingsStore({ storage: localStorage });
//   const ui = createScreenManager({ reducedMotion: settings.reducedMotion });
//   registerGameScreens(ui, { settings, levels, progress, load, callbacks });
//
// Layers:   screen modules (presentation only, call `actions`)  ->  this file (turns actions into manager calls + callbacks)
//           ->  the screen manager (the only thing that shows, hides, focuses and transitions screens).
// Link game-screens.css after screens.css.

import { createSettingsStore, SETTINGS_SCHEMA, SETTINGS_GROUPS } from './settings-store.js';
import { PROTOTYPE_LEVELS, resolveLevels, summarizeLevels } from './levels.js';
import { bootScreen } from './boot.js';
import { mainMenuScreen } from './main-menu.js';
import { levelSelectScreen } from './level-select.js';
import { settingsScreen } from './settings.js';
import { pauseScreen } from './pause.js';
import { resultsScreen, normalizeResult } from './results.js';

export { createSettingsStore, SETTINGS_SCHEMA, SETTINGS_GROUPS, PROTOTYPE_LEVELS, resolveLevels, summarizeLevels, normalizeResult };
export { bootScreen, mainMenuScreen, levelSelectScreen, settingsScreen, pauseScreen, resultsScreen };
export { rangeControl, toggleControl, choiceControl } from './controls.js';

/** Screen ids. `game` is the gameplay screen of Step 4: it is NOT registered here, only named so that `to` lists can point at it. */
export const DEFAULT_IDS = Object.freeze({
  boot: 'boot', mainMenu: 'main-menu', levelSelect: 'level-select', settings: 'settings', pause: 'pause', results: 'results', game: 'game',
});

/**
 * createGameScreens(ui, options) -> { definitions, settings, ids, actions, dispose }   (does not register; see registerGameScreens)
 *
 * options
 *   settings       a createSettingsStore() result (default: a new in-memory store)
 *   levels         array | () => array of { id, name?, iconName? }   (default: the prototype's single level)
 *   progress       object | () => object of { completed: { [id]: stars }, unlocked?, unlockAll? }
 *   load           boot loader: async ({ progress(percent, message?) }) => void
 *   minBootMs      shortest time the boot screen stays up (default 1400)
 *   schedule       (fn, ms) => cancel, injectable timer for the boot screen (tests)
 *   ids            overrides for DEFAULT_IDS
 *   warn           (…args) => void, default console.warn
 *   callbacks      integration hooks, all optional. Each is called BEFORE the navigation it belongs to; returning
 *                  exactly `false` cancels that navigation. A throwing callback is reported through `warn` and ignored.
 *       onBootComplete()  onBootError(error)  onSelectLevel(level)  onResume()  onRestart()  onQuitToMenu()
 *       onRetry(resultParams)  onNextLevel(resultParams)
 */
export function createGameScreens(ui, {
  settings = createSettingsStore(), levels = PROTOTYPE_LEVELS, progress = {}, load, minBootMs, schedule,
  ids: idOverrides, warn = (...args) => console.warn(...args), callbacks = {},
} = {}) {
  const ids = Object.freeze({ ...DEFAULT_IDS, ...idOverrides });
  const rejected = { ok: false, reason: 'vetoed' };

  // Run the integration callback first; it may veto. Then navigate.
  const guarded = (name, arg, navigate) => {
    try { if (callbacks[name]?.(arg) === false) return Promise.resolve(rejected); } catch (error) { warn(`[game-screens] callback "${name}" threw`, error); }
    return navigate();
  };
  // "Back", but a screen opened directly (nothing to go back to) falls through to the main menu instead of dead-ending.
  const goBack = () => ui.back().then(result => (result.ok || result.reason !== 'empty-history' ? result : ui.go(ids.mainMenu, {}, { reset: true })));

  const actions = {
    boot: {
      complete: () => guarded('onBootComplete', undefined, () => ui.go(ids.mainMenu, {}, { replace: true })),
      failed: error => { try { callbacks.onBootError?.(error); } catch (e) { warn('[game-screens] callback "onBootError" threw', e); } },
    },
    menu: { play: () => ui.go(ids.levelSelect), settings: () => ui.go(ids.settings) },
    levelSelect: {
      select: level => guarded('onSelectLevel', level, () => ui.go(ids.game, { level: level.id })),
      back: goBack,
    },
    settings: { back: goBack, close: () => ui.close(), reset: () => settings.reset() },
    pause: {
      resume: () => guarded('onResume', undefined, () => ui.close()),
      restart: () => guarded('onRestart', undefined, () => ui.close()),
      settings: () => ui.open(ids.settings),
      mainMenu: () => guarded('onQuitToMenu', undefined, () => ui.go(ids.mainMenu, {}, { reset: true })),
    },
    results: {
      retry: params => guarded('onRetry', params, () => ui.go(ids.game, { level: params?.level })),
      next: params => guarded('onNextLevel', params, () => ui.go(ids.game, { level: params?.nextLevel })),
      levels: () => ui.go(ids.levelSelect),
      mainMenu: () => ui.go(ids.mainMenu, {}, { reset: true }),
    },
  };

  const definitions = [
    bootScreen({ ids, actions: actions.boot, load, minDurationMs: minBootMs, schedule }),
    mainMenuScreen({ ids, actions: actions.menu }),
    levelSelectScreen({ ids, actions: actions.levelSelect, levels, progress }),
    settingsScreen({ ids, actions: actions.settings, settings }),
    pauseScreen({ ids, actions: actions.pause }),
    resultsScreen({ ids, actions: actions.results }),
  ];

  // Forced reduced motion (the Display setting) also reaches the Step 3 CSS animations through a stage attribute.
  const applyMotion = () => { if (ui.stage) ui.stage.dataset.mpReduceMotion = String(settings.reducedMotion()); };
  applyMotion();
  const dispose = settings.subscribe(({ key }) => { if (key === 'reduceMotion') applyMotion(); });

  return { definitions, settings, ids, actions, dispose };
}

export function registerGameScreens(ui, options) {
  const screens = createGameScreens(ui, options);
  ui.register(screens.definitions);
  return screens;
}
