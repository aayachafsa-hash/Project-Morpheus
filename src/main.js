import { createScene } from './scene/SceneManager.js?shadow-progress';
import { startGameSession } from './app/GameSession.js';
import { createInputSettings } from './ui/InputSettings.js';
import { LEVELS } from './gameplay/LevelRegistry.js';
import { createUI } from './ui/GameHUD.js?shadow-progress';
import { createShadowSystem } from './gameplay/ShadowSystem.js?shadow-progress';
import { createLoadingScreen } from './ui/LoadingScreen.js';

export { CONFIG } from './config.js?shadow-progress';

const ui = createUI();
const loading=createLoadingScreen();
loading.update(.03,'Preparing the renderer');
const view = await createScene(ui.stage,(value,message)=>loading.update(value,message),LEVELS[0]);
view.canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  ui.showError('Graphics context lost. Reload the page to restart.');
});

const shadows = createShadowSystem(view.shadowScene);
loading.update(.94,'Preparing the first silhouette');
await startGameSession(view, shadows, ui, createInputSettings);
await loading.complete(ui.ready);


