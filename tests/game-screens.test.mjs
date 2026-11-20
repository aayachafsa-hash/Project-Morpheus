// Step 3 tests in jsdom. Run: node tests/game-screens.test.mjs   (needs `npm i jsdom` once, same as the Step 1/2 tests)
// The cases live in game-screens.suite.mjs so the exact same ones also run in a real browser (game-screens.browser.mjs).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const k of ['window', 'document', 'KeyboardEvent', 'MouseEvent', 'Event', 'HTMLElement']) globalThis[k] = k === 'window' ? dom.window : dom.window[k];
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.removeEventListener = (...a) => dom.window.removeEventListener(...a);
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

const { runSuite } = await import('./game-screens.suite.mjs');
const { passed, failed, skipped } = await runSuite({ layout: false, log: console.log });
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (layout-only)`);
process.exitCode = failed ? 1 : 0;
