// Smoke tests for the UI kit. Run: node tests/smoke.test.mjs   (needs `npm i jsdom` once)
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const k of ['window', 'document', 'KeyboardEvent', 'MouseEvent', 'Event', 'HTMLElement']) globalThis[k] = k === 'window' ? dom.window : dom.window[k];
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.removeEventListener = (...a) => dom.window.removeEventListener(...a);
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

const kit = await import('../src/ui/index.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
const mount = el => (document.body.append(el), el);

console.log('Components');
test('every exported component renders without throwing', () => {
  [kit.glassPanel(), kit.screenTitle({ text: 'Play' }), kit.goldButton({ label: 'Go' }), kit.menuItem({ label: 'Play' }), kit.iconButton({ iconName: 'reset', label: 'Reset' }),
    kit.keyCap('Tab'), kit.keyHint({ keys: 'R', text: 'rotate' }), kit.statBadge(), kit.hudCard({ player: 'p1' }), kit.progressBar(), kit.starRating(), kit.laurelTitle({ text: 'Victory' }),
    kit.tabBar({ tabs: [{ id: 'a', text: 'A' }] }), kit.levelTile({ number: 1 }), kit.objectTray({ items: [] }), kit.backdrop()].forEach(mount);
});
test('all icons render, unknown icon throws', () => {
  for (const name of kit.iconNames) assert.ok(kit.icon(name).classList.contains('mp-icon'), name);
  assert.throws(() => kit.icon('nope'));
});
test('decorative icons are aria-hidden, labelled icons are role=img', () => {
  assert.equal(kit.icon('lock').getAttribute('aria-hidden'), 'true');
  assert.equal(kit.icon('lock', { label: 'Locked' }).getAttribute('role'), 'img');
});
test('goldButton: click fires; aria-disabled blocks click but stays focusable', () => {
  let n = 0; const b = mount(kit.goldButton({ label: 'Go', onClick: () => n++ })); b.click(); assert.equal(n, 1);
  b.setDisabled(true); b.click(); assert.equal(n, 1); assert.equal(b.getAttribute('aria-disabled'), 'true'); assert.equal(b.disabled, false);
});
test('menuItem: selected state toggles', () => { const m = kit.menuItem({ label: 'Play', selected: true }); assert.equal(m.dataset.selected, 'true'); m.setSelected(false); assert.equal(m.dataset.selected, undefined); });
test('iconButton: pressed state + icon swap', () => { const b = kit.iconButton({ iconName: 'pause', label: 'Pause', pressed: false }); b.setPressed(true); assert.equal(b.getAttribute('aria-pressed'), 'true'); b.setIcon('play'); assert.ok(b.querySelector('svg')); });
test('hudCard: independent live updates, null shows an em dash, no hardcoded values', () => {
  const a = kit.hudCard({ player: 'p1' }), b = kit.hudCard({ player: 'p2' });
  assert.equal(a.querySelector('output').textContent, '—');
  a.update(82.4); assert.equal(a.querySelector('output').textContent, '82%'); assert.equal(b.querySelector('output').textContent, '—');
  assert.equal(b.dataset.align, 'end'); assert.match(a.getAttribute('aria-label'), /Player 1/);
});
test('progressBar: aria values, clamping, easing converges', async () => {
  const p = mount(kit.progressBar({ value: 0, label: 'Loading' })); const track = p.querySelector('[role=progressbar]');
  p.update(250); assert.equal(track.getAttribute('aria-valuenow'), '100');
  await new Promise(r => setTimeout(r, 400)); assert.equal(p.querySelector('.mp-progress__value').textContent, '100%');
});
test('starRating: label reflects value', () => { const s = kit.starRating({ value: 2, max: 3 }); assert.equal(s.getAttribute('aria-label'), '2 of 3 stars'); assert.equal(s.children.length, 3); s.update(9); assert.equal(s.getAttribute('aria-label'), '3 of 3 stars'); });
test('tabBar: aria wiring, click, arrow keys, Home/End, roving tabindex', () => {
  const seen = []; const t = mount(kit.tabBar({ tabs: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], active: 'a', onChange: id => seen.push(id) }));
  const [a, b, c] = t.querySelectorAll('[role=tab]');
  assert.equal(a.getAttribute('aria-selected'), 'true'); assert.equal(b.tabIndex, -1);
  a.focus(); a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); assert.equal(b.getAttribute('aria-selected'), 'true'); assert.equal(document.activeElement, b);
  b.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); assert.equal(c.getAttribute('aria-selected'), 'true');
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); assert.equal(a.getAttribute('aria-selected'), 'true');
  assert.deepEqual(seen, ['b', 'c', 'a']); assert.ok(a.getAttribute('aria-controls').includes('panel-a'));
});
test('levelTile: locked is inert + labelled; unlocked fires with its number', () => {
  const calls = []; const lock = kit.levelTile({ number: 9, state: 'locked', onClick: n => calls.push(n) }), ok = kit.levelTile({ number: 7, state: 'current', onClick: n => calls.push(n) });
  lock.click(); ok.click(); assert.deepEqual(calls, [7]); assert.match(lock.getAttribute('aria-label'), /locked/); assert.equal(lock.getAttribute('aria-disabled'), 'true');
});
test('objectTray: selection, aria-pressed, callback, setItems', () => {
  const picks = []; const tray = mount(kit.objectTray({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], selected: 0, tone: 'p2', onSelect: i => picks.push(i) }));
  const slots = () => [...tray.querySelectorAll('.mp-slot')]; assert.equal(slots()[0].getAttribute('aria-pressed'), 'true');
  slots()[1].click(); assert.deepEqual(picks, [1]); assert.equal(slots()[1].getAttribute('aria-pressed'), 'true'); assert.equal(slots()[0].getAttribute('aria-pressed'), 'false');
  tray.setItems([{ id: 'x', label: 'X' }]); assert.equal(slots().length, 1); assert.equal(tray.dataset.tone, 'p2');
});
test('laurelTitle: fail tone has no laurels by default; heading level honored', () => {
  assert.equal(kit.laurelTitle({ text: 'Puzzle failed', tone: 'fail' }).querySelectorAll('.mp-laurel').length, 0);
  assert.equal(kit.laurelTitle({ text: 'Victory' }).querySelectorAll('.mp-laurel').length, 2);
  assert.equal(kit.laurelTitle({ text: 'x', level: 2 }).querySelector('h2')?.textContent, 'x');
});
test('backdrop: dust is capped, decorative, and destroy() cleans up', () => {
  const b = mount(kit.backdrop({ dustCount: 999 })); assert.ok(b.querySelectorAll('.mp-dust').length <= 24); assert.equal(b.getAttribute('aria-hidden'), 'true');
  b.destroy(); assert.equal(b.isConnected, false);
});
test('components never inject text via innerHTML (labels with markup stay text)', () => {
  const b = kit.goldButton({ label: '<img src=x onerror=alert(1)>' }); assert.equal(b.querySelector('img'), null);
  const i = kit.icon('lock', { label: '"><script>1</script>' }); assert.equal(i.querySelector('script'), null);
});

console.log('\nTokens / CSS');
const tokens = fs.readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
const tok = name => tokens.match(new RegExp(`--mp-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
for (const [fg, bg, min] of [['parchment', 'bg-2', 7], ['tan', 'bg-2', 4.5], ['tan', 'bg-3', 4.5], ['gold', 'bg-2', 4.5], ['p1', 'bg-2', 4.5], ['p2', 'bg-2', 4.5], ['teal', 'bg-2', 4.5], ['fail-text', 'fail-bg', 4.5]]) {
  test(`contrast ${fg} on ${bg} ≥ ${min}`, () => { const r = ratio(tok(fg), tok(bg)); console.log(`        (${r.toFixed(2)}:1)`); assert.ok(r >= min, `${r.toFixed(2)}`); });
}
test('tan-dim is flagged decorative only (below 4.5:1 on bg-2)', () => assert.ok(ratio(tok('tan-dim'), tok('bg-2')) < 4.5));
test('every component class has a rule; every rule is .mp- prefixed (no leaks into prototype CSS)', () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...stripped.matchAll(/(^|\n)([^@{}\/\n][^{}]*)\{/g)].map(m => m[2].trim()).filter(s => !/^(from|to|\d+%|0%|20%|100%|0%, 100%|50%)/.test(s));
  const bad = selectors.flatMap(s => s.split(',')).map(s => s.trim()).filter(s => s && !/mp-/.test(s) && !/^:where/.test(s));
  assert.deepEqual(bad, []);
});
test('prefers-reduced-motion rule present', () => assert.match(css, /prefers-reduced-motion: reduce/));
test('no pill radii or emoji in the kit', () => { assert.doesNotMatch(css + tokens, /border-radius:\s*(9999|999)px/); assert.doesNotMatch(fs.readdirSync(new URL('../src/ui/components/', import.meta.url)).map(f => fs.readFileSync(new URL(`../src/ui/components/${f}`, import.meta.url), 'utf8')).join(''), /\p{Extended_Pictographic}/u); });

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
process.exit(process.exitCode || 0);
