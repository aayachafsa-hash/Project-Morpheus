import { CONFIG } from '../config.js';
import { createMenu } from './Menu.js';

const $ = selector => document.querySelector(selector);

export function createUI() {
  const menu = createMenu();

  function drawTargetMask(target) {
    const scoreSettings = CONFIG.scoring;
    const context = $('#target').getContext('2d');
    const image = context.createImageData(scoreSettings.width, scoreSettings.height);
    for (let y = 0; y < scoreSettings.height; y++) {
      for (let x = 0; x < scoreSettings.width; x++) {
        const value = target[(scoreSettings.height - 1 - y) * scoreSettings.width + x];
        const offset = (y * scoreSettings.width + x) * 4;
        const rgb = value ? [30, 28, 25] : [230, 216, 190];
        image.data.set([...rgb, 255], offset);
      }
    }
    context.putImageData(image, 0, 0);
    // Crop only the HUD thumbnail for readability. IoU always uses the entire
    // fixed wall rectangle, so translation/depth cannot game the score.
    const preview = document.createElement('canvas');
    preview.width = scoreSettings.width;
    preview.height = scoreSettings.height;
    preview.getContext('2d').putImageData(image, 0, 0);
    let minX = scoreSettings.width, maxX = 0, minY = scoreSettings.height, maxY = 0;
    for (let y = 0; y < scoreSettings.height; y++) for (let x = 0; x < scoreSettings.width; x++) {
      if (target[(scoreSettings.height - 1 - y) * scoreSettings.width + x]) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    const width = maxX - minX + 1, height = maxY - minY + 1;
    const scale = Math.min((preview.width - 24) / width, (preview.height - 24) / height);
    context.fillStyle = '#e6d8be';
    context.fillRect(0, 0, preview.width, preview.height);
    context.drawImage(preview, minX, minY, width, height, (preview.width - width * scale) / 2, (preview.height - height * scale) / 2, width * scale, height * scale);
  }

  return {
    stage: $('#stage'),
    bindControls: menu.bindButtons,
    drawTargetMask,
    setPaused: menu.setPaused,
    setMatch(match) { $('#match').textContent = `${match}%`; },
    setPerformance(message) { $('#performance').textContent = message; },
    showError(message) {
      $('#error').hidden = false;
      $('#error').textContent = message;
    },
  };
}
