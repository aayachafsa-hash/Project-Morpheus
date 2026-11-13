import { createScene } from './scene/SceneManager.js';
import { startGameplay } from './gameplay/ObjectController.js';
import { createUI } from './ui/GameHUD.js';
import { createShadowSystem } from './gameplay/ShadowSystem.js';

export { CONFIG } from './config.js';

const ui = createUI();
const view = await createScene(ui.stage);
view.canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  ui.showError('Graphics context lost. Reload the page to restart.');
});

const shadows = createShadowSystem(view.shadowScene);
startGameplay(view, shadows, ui);
view.loadImportedSculpture().catch(error => {
  console.error('Could not load the extracted airplane mesh:', error);
  ui.showError('The airplane mesh could not load. Check src/assets/models/airplane1.glb and run this page through a local HTTP server.');
});
