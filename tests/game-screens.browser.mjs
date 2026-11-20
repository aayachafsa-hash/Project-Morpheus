// Real-browser run of the Step 3 tests. Needs Playwright + Chromium (`npm i -D playwright && npx playwright install chromium`).
//   node tests/game-screens.browser.mjs
// Part 1 runs game-screens.suite.mjs in Chromium (real layout, real `inert`, real focus).
// Part 2 drives game-screens-demo.html with REAL key presses and fails on any console error, page error or failed request.
// Google Fonts requests are answered locally so the run does not depend on the network (fonts are not under test).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
let failures = 0;
const check = (ok, name, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`); if (!ok) failures += 1; };

async function openPage(url, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(url);
  return { page, problems };
}

// ── Part 1: the shared suite in Chromium ──
console.log('Part 1: test suite in Chromium');
{
  const { page, problems } = await openPage(`${base}/tests/game-screens.suite.html`);
  await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
  const { lines, result } = await page.evaluate(() => ({ lines: window.__lines, result: window.__result }));
  console.log(lines.join('\n'));
  console.log(`\n  ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);
  failures += result.failed;
  check(problems.length === 0, 'no console errors, warnings or page errors during the suite', problems.join(' | '));
  await page.close();
}

// ── Part 2: the demo with real keyboard input ──
console.log('\nPart 2: demo page, real key presses, console watched');
{
  const { page, problems } = await openPage(`${base}/game-screens-demo.html`);
  const current = () => page.evaluate(() => window.ui().current?.id);
  const overlays = () => page.evaluate(() => window.ui().overlays.join(','));
  const focused = () => page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim());
  const start = async kind => { if (!(await page.locator('.demo-inspector').evaluate(el => el.open))) await page.click('.demo-inspector > summary'); await page.click(`[data-start="${kind}"]`); await page.waitForTimeout(900); };

  await page.waitForFunction(() => window.ui?.().current?.id === 'main-menu', null, { timeout: 10000 });
  check(await current() === 'main-menu', 'boot hands over to the main menu on its own');
  check((await focused()).startsWith('Play'), 'main menu: Play has focus');
  await page.keyboard.press('ArrowDown'); check((await focused()).startsWith('Settings'), 'main menu: ArrowDown moves to Settings');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  check(await current() === 'level-select', 'Enter on Play opens level select');
  check((await focused()).startsWith('Level 04'), 'level select: focus starts on the current level', await focused());

  await page.keyboard.press('ArrowRight');
  check((await focused()).includes('locked'), 'ArrowRight reaches a locked tile (still focusable)', await focused());
  await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  check(await current() === 'level-select', 'Enter and Space on a locked tile do not start a level');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  check(await current() === 'game', 'Enter on an available tile starts the gameplay screen');
  check(await page.evaluate(() => window.ui().current.params.level) === 'pebble', 'the level id is passed on');

  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check(await current() === 'game' && await overlays() === '', 'Escape on the gameplay screen is not touched by the manager');
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.waitForTimeout(500);
  check(await overlays() === 'pause', 'the HUD Pause button opens the overlay');
  check((await focused()).startsWith('Resume'), 'pause: focus on Resume');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check((await focused()).startsWith('Resume'), 'pause: Tab wraps inside the overlay');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check(await overlays() === 'pause,settings', 'Enter on Settings opens it above Pause');
  await page.keyboard.press('Space'); // first control is a slider: Space does nothing harmful
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check(await overlays() === 'pause' && (await focused()).startsWith('Settings'), 'Escape closes settings only; focus returns to the Settings item');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check(await overlays() === '' && await current() === 'game', 'Escape in Pause resumes');
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Pause', 'focus returns to the HUD Pause button');

  // Settings with a real keyboard
  await start('settings');
  check(await page.evaluate(() => document.activeElement?.className) === 'mp-gs-range', 'settings: first slider focused');
  const before = await page.evaluate(() => document.querySelector('.mp-gs-control output').textContent);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  const after = await page.evaluate(() => document.querySelector('.mp-gs-control output').textContent);
  check(before === '80%' && after === '70%', 'settings: arrow keys change the slider and its readout', `${before} -> ${after}`);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab'); // music, effects, mute switch
  await page.keyboard.press('Tab'); // wait: three Tabs land on the switch after master -> music -> effects -> switch
  const sw = await page.evaluate(() => ({ role: document.activeElement.getAttribute('role'), checked: document.activeElement.getAttribute('aria-checked') }));
  check(sw.role === 'switch' || sw.role === 'radio', 'settings: Tab reaches the next control type', JSON.stringify(sw));
  await page.evaluate(() => document.querySelector('[role="switch"]').focus());
  await page.keyboard.press('Space');
  check(await page.evaluate(() => document.querySelector('[role="switch"]').getAttribute('aria-checked')) === 'true', 'settings: Space toggles a switch');
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.querySelector('[role="switch"]').getAttribute('aria-checked')) === 'false', 'settings: Enter toggles it back');
  await page.evaluate(() => document.querySelector('[role="radio"][aria-checked="true"]').focus());
  await page.keyboard.press('ArrowLeft');
  check(await page.evaluate(() => document.querySelector('[role="radio"][aria-checked="true"]').dataset.value) === 'medium', 'settings: arrow key moves the graphics-quality choice');
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  check(await current() === 'main-menu', 'settings opened directly: Escape falls back to the main menu');

  // Results
  await start('failure');
  check((await focused()).startsWith('Retry'), 'failure results: Retry focused');
  check(await page.evaluate(() => window.ui().backdrop.dataset.variant) === 'fail', 'failure results: fail backdrop');
  await start('success');
  check((await focused()).startsWith('Next level'), 'success results: Next level focused');
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  check(await current() === 'game' && await page.evaluate(() => window.ui().current.params.level) === 'crescent', 'Enter on Next level starts the next level');

  // Reduced motion honoured by the OS preference
  const rm = await openPage(`${base}/game-screens-demo.html`);
  await rm.page.emulateMedia({ reducedMotion: 'reduce' }); await rm.page.reload();
  await rm.page.waitForFunction(() => window.ui?.().current?.id === 'main-menu', null, { timeout: 4000 });
  check(true, 'reduced motion (OS): boot still completes and reaches the main menu');
  check(await rm.page.evaluate(() => document.querySelectorAll('.mp-screen').length) === 1, 'reduced motion (OS): only one screen is ever in the DOM');
  check(rm.problems.length === 0, 'reduced-motion page: no console problems', rm.problems.join(' | '));
  await rm.page.close();

  check(problems.length === 0, 'no console errors, warnings, page errors or failed requests during the keyboard walk-through', problems.join(' | '));
  await page.close();
}

await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
