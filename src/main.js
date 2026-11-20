import { createScene } from './scene/SceneManager.js?shadow-progress';
import { startGameplay } from './gameplay/ObjectController.js?shadow-progress';
import { createUI } from './ui/GameHUD.js?shadow-progress';
import { createShadowSystem } from './gameplay/ShadowSystem.js?shadow-progress';

export { CONFIG } from './config.js?shadow-progress';

const ui = createUI();
const view = await createScene(ui.stage);
view.canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  ui.showError('Graphics context lost. Reload the page to restart.');
});

const shadows = createShadowSystem(view.shadowScene);
if (new URLSearchParams(location.search).get('mode') === 'duel') {
  const { startDuel } = await import('./gameplay/LocalMultiplayer.js');
  startDuel(view, ui);
} else {
  startGameplay(view, shadows, ui);
}
