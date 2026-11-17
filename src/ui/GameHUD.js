import { CONFIG } from '../config.js?shadow-progress';
import { createMenu } from './Menu.js?shadow-progress';

const $ = selector => document.querySelector(selector);

export function createUI() {
  const menu = createMenu();
  const controls = $('#player-controls');
  const axisLabel = $('#rotation-axis');
  const match = $('#match');
  const status = $('#match-status');
  const dots = [...$('#progress-dots').children];
  const assistButton = $('#assist');
  const showSolution = $('#show-solution');

  function drawTargetMask(target) {
    const scoreSettings = CONFIG.scoring;
    const canvas = $('#target');
    canvas.width = scoreSettings.width;
    canvas.height = scoreSettings.height;
    const context = canvas.getContext('2d');
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

    const reference = $('#target-reference');
    reference.addEventListener('load', () => {
      reference.hidden = false;
      canvas.hidden = true;
    }, { once: true });
    reference.src = CONFIG.puzzle.referenceImage;
  }

  return {
    stage: $('#stage'),
    bindControls: menu.bindButtons,
    drawTargetMask,
    setPaused: menu.setPaused,
    setMode(mode) {
      if (controls.dataset.mode !== mode) controls.dataset.mode = mode;
    },
    setRotationAxis(axis) { axisLabel.textContent = axis; },
    setProgress(result, message, completed, canAssist, paused) {
      const value = result ? `${result.percent}%` : '—';
      if (match.textContent !== value) match.textContent = value;
      if (status.textContent !== message) status.textContent = message;
      CONFIG.scoring.progressDots.forEach((threshold, i) => {
        dots[i].classList.toggle('lit', (result?.similarity ?? 0) >= threshold);
      });
      dots.at(-1).classList.toggle('lit', completed);
      assistButton.disabled = !canAssist;
      showSolution.disabled = paused || completed;
    },
    setPerformance(message) { $('#performance').textContent = message; },
    showError(message) {
      $('#error').hidden = false;
      $('#error').textContent = message;
    },
  };
}
