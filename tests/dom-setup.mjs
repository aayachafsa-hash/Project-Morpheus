// Minimal browser globals for the input/session tests. Needs: npm install --no-save jsdom three@0.170.0
import { JSDOM } from 'jsdom';

export function setupDom() {
  const dom = new JSDOM('<!doctype html><body><div class="actions"><button id="pause">Pause</button></div><canvas id="stage" tabindex="0"></canvas><input id="slider" type="range"></body>');
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.addEventListener = window.addEventListener.bind(window);
  globalThis.removeEventListener = window.removeEventListener.bind(window);
  globalThis.KeyboardEvent = window.KeyboardEvent;
  return window;
}

export function press(window, target, code, type = 'keydown', extra = {}) {
  const event = new window.KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
}
