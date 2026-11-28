import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Same colours as --mp-p1 / --mp-p2 in tokens.css.
const TONES = { p1: '#67c0e6', p2: '#4ad28f' };
const IDS = ['p1', 'p2'];

/**
 * Split-screen renderer for Duel mode. It reuses the one room, one projector and one renderer: each player gets
 * their own piece and their own half of the canvas. A half is drawn with only that player's piece visible, so
 * each side shows its own shadow on the wall. Solo mode is untouched until enter() is called.
 */
export function createDuelRig({ renderer, scene, soloCamera, soloPiece, atmosphere, fireflies, invalidateSolo, roomMeshes = [], extendable = [] }) {
  const cameras = { p1: soloCamera.clone(), p2: soloCamera.clone() };
  const size = new THREE.Vector2();
  const pieces = {};
  const selection = { mode: 'rotate', active: false, direction: 0, paused: false, piece: soloPiece };
  let active = false, dirty = true, idle = 0, geometry = null;
  // Room decor that only belongs to one end of the gallery. While a half is drawn, the decor of the OTHER end is
  // hidden, so the screen reads as one wide room: left decor | P1 | plain wall | P2 | right decor, instead of two
  // complete rooms glued together. Filled once, on the first enter().
  const hiddenFor = { p1: [], p2: [] };
  // The lit limestone wall and the marble floor are narrower than the view and end in dark bays / empty space. Next to
  // the seam each half gets a mirrored copy of them instead, so wall and floor simply carry on across the middle of
  // the screen. `extendable` is the list of room objects to continue (wall, floor).
  const extensions = { p1: [], p2: [] };
  function buildExtensions() {
    if (extensions.p1.length || extensions.p2.length) return;
    for (const source of extendable) {
      if (!source) continue;
      source.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3().setFromObject(source, true);
      const mirrored = edgeX => {
        const copy = source.clone();
        copy.matrixAutoUpdate = false;
        copy.matrix.makeTranslation(2 * edgeX, 0, 0).multiply(new THREE.Matrix4().makeScale(-1, 1, 1)).multiply(source.matrixWorld);
        copy.matrixWorldNeedsUpdate = true;
        copy.visible = false;
        copy.traverse(node => { if (node.isMesh) node.receiveShadow = true; });
        return copy;
      };
      extensions.p1.push(mirrored(bounds.max.x));   // P1 is the left half: its seam is the object's right end.
      extensions.p2.push(mirrored(bounds.min.x));   // P2 is the right half: its seam is the object's left end.
    }
  }
  let decorSorted = false;
  function sortDecor() {
    if (decorSorted) return;
    decorSorted = true;
    const split = CONFIG.duel?.decorSplitX ?? 5;
    const box = new THREE.Box3(), centre = new THREE.Vector3();
    for (const mesh of roomMeshes) {
      if (!mesh?.isMesh) continue;
      mesh.updateWorldMatrix(true, false);
      box.setFromObject(mesh, true);
      if (box.isEmpty()) continue;
      box.getCenter(centre);
      // World -x is the left of the screen. P1 owns the left half, so it must not show the right-hand decor.
      if (centre.x > split) hiddenFor.p1.push(mesh);
      else if (centre.x < -split) hiddenFor.p2.push(mesh);
    }
  }

  // Mirrors SceneManager.resize() for a camera that only owns half of the canvas.
  function fit(camera, aspect) {
    const { focalLength, sensorWidth, shift = [0, 0], fov = 45, minHorizontalFov: soloHorizontalFov = 0 } = CONFIG.camera;
    // Optional: CONFIG.duel.minHorizontalFov narrows each half's view so the seam edges show plain wall near the
    // figure instead of the room's far corners. Leave it unset and the halves frame exactly as before.
    const minHorizontalFov = CONFIG.duel?.minHorizontalFov ?? soloHorizontalFov;
    camera.aspect = aspect;
    if (focalLength > 0 && sensorWidth > 0) {
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(sensorWidth / (2 * focalLength * aspect)));
    } else {
      const horizontalHalfAngle = THREE.MathUtils.degToRad(minHorizontalFov / 2);
      camera.fov = Math.max(fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalHalfAngle) / aspect)));
    }
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = 2 * shift[0];
    camera.projectionMatrix.elements[9] = 2 * shift[1] * aspect;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function layout() {
    renderer.getSize(size);
    const left = Math.floor(size.x / 2);
    return [['p1', 0, left], ['p2', left, size.x - left]];
  }
  function fitCameras() { for (const [id, , width] of layout()) fit(cameras[id], width / size.y); }
  const onResize = () => { fitCameras(); dirty = true; };

  function makePiece(id) {
    const mesh = new THREE.Mesh(geometry, soloPiece.mesh.material.clone());
    mesh.castShadow = true; mesh.receiveShadow = true;
    const outline = new THREE.Group();
    const tone = new THREE.Color(TONES[id]);
    soloPiece.outline.children.forEach((shell, index) => {
      const copy = new THREE.Mesh(geometry, shell.material.clone());
      copy.material.color.copy(index === 0 ? tone.clone().lerp(new THREE.Color(1, 1, 1), .35) : tone);
      copy.scale.copy(shell.scale);
      outline.add(copy);
    });
    outline.visible = true;
    mesh.add(outline);
    return { mesh, outline, height: 0, targetPosition: new THREE.Vector3(), targetRotation: new THREE.Quaternion() };
  }
  function useGeometry(next, level) {
    const previous = geometry;
    geometry = next;
    for (const id of IDS) {
      const piece = pieces[id];
      piece.mesh.geometry = next;
      piece.mesh.name = level.name.toUpperCase();
      for (const shell of piece.outline.children) shell.geometry = next;
    }
    if (previous && previous !== next) previous.dispose();
  }
  function draw() {
    renderer.setScissorTest(true);
    for (const [id, x, width] of layout()) {
      for (const other of IDS) pieces[other].mesh.visible = other === id;
      // Shadow maps are manual in this project, and each half needs its own piece's shadow.
      renderer.shadowMap.needsUpdate = true;
      renderer.setViewport(x, 0, width, size.y);
      renderer.setScissor(x, 0, width, size.y);
      const hidden = hiddenFor[id].filter(mesh => mesh.visible);
      for (const mesh of hidden) mesh.visible = false;
      for (const copy of extensions[id]) copy.visible = true;
      renderer.render(scene, cameras[id]);
      for (const copy of extensions[id]) copy.visible = false;
      for (const mesh of hidden) mesh.visible = true;
    }
    // Scoring reads mesh.visible, so both pieces must be visible again between frames.
    for (const id of IDS) pieces[id].mesh.visible = true;
  }

  return {
    get active() { return active; },
    pieces,
    camera: id => cameras[id],
    invalidate() { dirty = true; },
    enter(nextGeometry, level) {
      if (!pieces.p1) {
        geometry = nextGeometry;
        for (const id of IDS) pieces[id] = makePiece(id);
      }
      useGeometry(nextGeometry, level);
      for (const id of IDS) { scene.add(pieces[id].mesh); pieces[id].mesh.visible = true; }
      soloPiece.mesh.visible = false;
      sortDecor();
      buildExtensions();
      for (const id of IDS) for (const copy of extensions[id]) if (!copy.parent) scene.add(copy);
      if (!active) addEventListener('resize', onResize);
      active = true; dirty = true; idle = 0;
      fitCameras();
    },
    setLevel(nextGeometry, level) { useGeometry(nextGeometry, level); dirty = true; },
    resetPieces(level) {
      for (const id of IDS) {
        const piece = pieces[id];
        piece.mesh.position.fromArray(level.anchor);
        piece.mesh.quaternion.setFromEuler(new THREE.Euler(...level.startPose));
        piece.targetPosition.copy(piece.mesh.position);
        piece.targetRotation.copy(piece.mesh.quaternion);
        piece.mesh.visible = true;
      }
      dirty = true;
    },
    renderFrame(delta, frozen = false) {
      if (!active) return;
      idle += frozen ? 0 : delta;
      const atmosphereDue = !frozen && idle >= 1 / CONFIG.atmosphere.idleFrameRate;
      if (!dirty && !atmosphereDue) return;
      selection.paused = frozen;
      atmosphere.update(idle, renderer, cameras.p1);
      fireflies.update(idle, renderer, cameras.p1, selection);
      idle = 0;
      draw();
      dirty = false;
    },
    exit() {
      if (!active) return;
      active = false;
      removeEventListener('resize', onResize);
      for (const id of IDS) { scene.remove(pieces[id].mesh); for (const copy of extensions[id]) scene.remove(copy); }
      soloPiece.mesh.visible = true;
      renderer.setScissorTest(false);
      renderer.getSize(size);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.shadowMap.needsUpdate = true;
      invalidateSolo();
    },
  };
}
