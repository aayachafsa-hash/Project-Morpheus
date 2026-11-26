import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './dom-setup.mjs';

const window = setupDom();
const THREE = await import('three');
const { createDuelRig } = await import('../src/scene/DuelRig.js');
const { CONFIG } = await import('../src/config.js');

function build() {
  const scene = new THREE.Scene();
  const soloCamera = new THREE.PerspectiveCamera(34.5, 16 / 9);
  soloCamera.position.fromArray(CONFIG.camera.position);
  soloCamera.rotation.set(...CONFIG.camera.rotation, 'YXZ');
  const geometry = () => new THREE.BoxGeometry();
  const solo = { mesh: new THREE.Mesh(geometry(), new THREE.MeshStandardMaterial()), outline: new THREE.Group() };
  for (const scale of [1.021, 1.036, 1.056]) { const shell = new THREE.Mesh(solo.mesh.geometry, new THREE.MeshBasicMaterial()); shell.scale.setScalar(scale); solo.outline.add(shell); }
  solo.mesh.add(solo.outline); scene.add(solo.mesh);
  const size = { x: 1920, y: 1080 };
  const draws = [], calls = { scissorTest: [], viewport: [] };
  const renderer = {
    shadowMap: { needsUpdate: false },
    getSize: v => v.set(size.x, size.y),
    setScissorTest: on => calls.scissorTest.push(on),
    setViewport: (...a) => { renderer.viewport = a; calls.viewport.push(a); },
    setScissor: (...a) => { renderer.scissor = a; },
    render: (_scene, camera) => {
      draws.push({ viewport: renderer.viewport, scissor: renderer.scissor, camera, shadowRefresh: renderer.shadowMap.needsUpdate,
        visible: { solo: solo.mesh.visible, p1: rig.pieces.p1.mesh.visible, p2: rig.pieces.p2.mesh.visible } });
      renderer.shadowMap.needsUpdate = false;
    },
  };
  const updates = { atmosphere: [], fireflies: [] };
  let soloInvalidated = 0;
  const rig = createDuelRig({
    renderer, scene, soloCamera, soloPiece: solo,
    atmosphere: { update: (...a) => updates.atmosphere.push(a) }, fireflies: { update: (...a) => updates.fireflies.push(a) },
    invalidateSolo: () => { soloInvalidated++; },
  });
  solo.camera = soloCamera;
  return { rig, scene, solo, renderer, draws, calls, updates, size, geometry, soloInvalidated: () => soloInvalidated };
}
const level = { name: 'Teapot', anchor: [1, 2, 3], startPose: [0.1, 0.2, 0.3] };

test('enter adds both players\' pieces to the scene and hides the solo piece', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  assert.equal(t.rig.active, true);
  assert.ok(t.scene.children.includes(t.rig.pieces.p1.mesh) && t.scene.children.includes(t.rig.pieces.p2.mesh));
  assert.equal(t.solo.mesh.visible, false);
  assert.notEqual(t.rig.pieces.p1.mesh, t.rig.pieces.p2.mesh);
  assert.ok(t.rig.pieces.p1.mesh.castShadow && t.rig.pieces.p2.mesh.receiveShadow);
});
test('each half is drawn with only its own player\'s piece, its own shadow refresh and a half-width camera', () => {
  const t = build(); t.rig.enter(t.geometry(), level); t.rig.resetPieces(level);
  t.rig.renderFrame(1 / 60);
  assert.equal(t.draws.length, 2);
  const [left, right] = t.draws;
  assert.deepEqual(left.viewport, [0, 0, 960, 1080]);   assert.deepEqual(left.scissor, [0, 0, 960, 1080]);
  assert.deepEqual(right.viewport, [960, 0, 960, 1080]); assert.deepEqual(right.scissor, [960, 0, 960, 1080]);
  assert.deepEqual(left.visible, { solo: false, p1: true, p2: false });
  assert.deepEqual(right.visible, { solo: false, p1: false, p2: true });
  assert.equal(left.shadowRefresh, true); assert.equal(right.shadowRefresh, true);
  assert.notEqual(left.camera, right.camera);
  assert.ok(Math.abs(left.camera.aspect - 960 / 1080) < 1e-9);
  assert.ok(left.camera.fov >= CONFIG.camera.fov, 'tall halves widen the vertical field of view');
  assert.equal(t.calls.scissorTest.at(-1), true);
  assert.equal(t.rig.pieces.p1.mesh.visible && t.rig.pieces.p2.mesh.visible, true, 'both visible again so scoring sees them');
});
test('both halves look at the scene from the same place as the solo camera', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  for (const id of ['p1', 'p2']) {
    assert.ok(t.rig.camera(id).position.equals(t.solo.camera.position), `${id} position`);
    assert.ok(t.rig.camera(id).quaternion.equals(t.solo.camera.quaternion), `${id} orientation`);
  }
});
test('odd widths split without a gap or overlap', () => {
  const t = build(); t.size.x = 1001; t.rig.enter(t.geometry(), level); t.rig.renderFrame(1 / 60);
  const [left, right] = t.draws.map(draw => draw.viewport);
  assert.equal(left[0] + left[2], right[0]);
  assert.equal(right[0] + right[2], 1001);
});
test('no redraw while nothing changed, redraw when a piece moves', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  t.rig.renderFrame(1 / 60); assert.equal(t.draws.length, 2);
  t.rig.renderFrame(1 / 240); assert.equal(t.draws.length, 2, 'idle frame skipped');
  t.rig.invalidate(); t.rig.renderFrame(1 / 240); assert.equal(t.draws.length, 4);
});
test('the dust and fireflies keep animating on idle frames, and freeze when paused', () => {
  const t = build(); t.rig.enter(t.geometry(), level); t.rig.renderFrame(1 / 60);
  const before = t.draws.length;
  for (let i = 0; i < 4; i++) t.rig.renderFrame(1 / 60);          // 4/60s > 1/24s
  assert.ok(t.draws.length > before, 'atmosphere frame due');
  const paused = t.draws.length;
  for (let i = 0; i < 60; i++) t.rig.renderFrame(1 / 60, true);
  assert.equal(t.draws.length, paused, 'frozen frames do not redraw');
});
test('resize re-fits both cameras', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  t.size.x = 1000; t.size.y = 1000; window.dispatchEvent(new window.Event('resize'));
  assert.ok(Math.abs(t.rig.camera('p1').aspect - 0.5) < 1e-9);
  t.rig.renderFrame(1 / 60);
  assert.deepEqual(t.draws[0].viewport, [0, 0, 500, 1000]);
});
test('setLevel swaps the puzzle on both players\' pieces and outlines and frees the old geometry', () => {
  const t = build(); const first = t.geometry(); t.rig.enter(first, level);
  let disposed = 0; first.addEventListener('dispose', () => disposed++);
  const second = t.geometry(); t.rig.setLevel(second, { ...level, name: 'Horse' });
  for (const id of ['p1', 'p2']) {
    assert.equal(t.rig.pieces[id].mesh.geometry, second);
    assert.ok(t.rig.pieces[id].outline.children.every(shell => shell.geometry === second));
    assert.equal(t.rig.pieces[id].mesh.name, 'HORSE');
  }
  assert.equal(disposed, 1);
  const solo = t.solo.mesh.geometry; assert.notEqual(solo, second, 'solo geometry never touched');
});
test('resetPieces puts both pieces at the level\'s anchor and start pose', () => {
  const t = build(); t.rig.enter(t.geometry(), level); t.rig.resetPieces(level);
  const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
  for (const id of ['p1', 'p2']) {
    const piece = t.rig.pieces[id];
    assert.deepEqual(piece.mesh.position.toArray(), [1, 2, 3]);
    assert.ok(piece.mesh.quaternion.angleTo(expected) < 1e-6);
    assert.ok(piece.targetRotation.angleTo(expected) < 1e-6 && piece.targetPosition.equals(piece.mesh.position));
  }
});
test('players are told apart by outline colour (blue / green)', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  const colour = id => t.rig.pieces[id].outline.children[1].material.color.getHexString();
  assert.equal(colour('p1'), '67c0e6');
  assert.equal(colour('p2'), '4ad28f');
  assert.ok(t.rig.pieces.p1.outline.visible && t.rig.pieces.p2.outline.visible);
});
test('exit restores solo rendering exactly: solo piece back, full viewport, scissor off, pieces out of the scene', () => {
  const t = build(); t.rig.enter(t.geometry(), level); t.rig.renderFrame(1 / 60);
  t.rig.exit();
  assert.equal(t.rig.active, false);
  assert.equal(t.solo.mesh.visible, true);
  assert.equal(t.calls.scissorTest.at(-1), false);
  assert.deepEqual(t.calls.viewport.at(-1), [0, 0, 1920, 1080]);
  assert.equal(t.renderer.shadowMap.needsUpdate, true);
  assert.ok(!t.scene.children.includes(t.rig.pieces.p1.mesh) && !t.scene.children.includes(t.rig.pieces.p2.mesh));
  assert.equal(t.soloInvalidated(), 1);
  const draws = t.draws.length; t.rig.renderFrame(1 / 60); assert.equal(t.draws.length, draws, 'rig draws nothing after exit');
  window.dispatchEvent(new window.Event('resize'));                 // listener removed: must not throw or redraw
});
test('a second duel reuses the same pieces', () => {
  const t = build(); t.rig.enter(t.geometry(), level);
  const p1 = t.rig.pieces.p1; t.rig.exit(); t.rig.enter(t.geometry(), level);
  assert.equal(t.rig.pieces.p1, p1);
  assert.ok(t.scene.children.includes(p1.mesh));
});
