import * as THREE from 'three';

const KEY = 'morpheus.authoring.v1';
const get = id => document.getElementById('mp-authoring-' + id);

export function poseSnapshot(level, view, activePiece, maskSpace) {
  const { scene, wall, spotlight, pieces } = view.shadowScene;
  scene.updateMatrixWorld(true);
  view.camera.updateWorldMatrix(true, false);
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), rotation = new THREE.Euler();
  function transform(object) {
    object.updateWorldMatrix(true, false);
    object.matrixWorld.decompose(position, quaternion, scale);
    rotation.setFromQuaternion(quaternion, 'XYZ');
    return {
      name: object.name,
      type: object.type,
      localPosition: object.position.toArray(),
      localQuaternion: object.quaternion.toArray(),
      localScale: object.scale.toArray(),
      worldPosition: position.toArray(),
      worldQuaternion: quaternion.toArray(),
      worldRotationXYZ: rotation.toArray().slice(0, 3),
      worldScale: scale.toArray(),
      worldMatrix: object.matrixWorld.toArray(),
    };
  }
  const objects = [];
  function record(object, path) {
    objects.push({ path, ...transform(object) });
    object.children.forEach((child, index) => record(child, path + '/' + index));
  }
  record(scene, 'scene');
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    level: { id: level.id, name: level.name, mesh: level.mesh, anchor: [...level.anchor] },
    rotationUnits: 'radians',
    quaternionOrder: 'xyzw',
    matrixLayout: 'column-major',
    activePiece,
    pieces: pieces.map(piece => transform(piece.mesh)),
    projector: { ...transform(spotlight), target: transform(spotlight.target), halfAngle: spotlight.angle },
    wall: transform(wall),
    camera: { ...transform(view.camera), fov: view.camera.fov, projectionMatrix: view.camera.projectionMatrix.toArray() },
    mask: { ...maskSpace, foreground: 'white', rowOrigin: 'top-left' },
    objects,
  };
}

export function maskToRgba(mask, width, height) {
  if (mask?.length !== width * height) throw new Error('Unexpected shadow mask dimensions');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const shade = mask[(height - 1 - y) * width + x] ? 255 : 0;
    rgba.set([shade, shade, shade, 255], offset);
  }
  return rgba;
}

async function encodeMask(mask, { width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(maskToRgba(mask, width, height), width, height), 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the shadow PNG');
  return blob;
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createAuthoringPanel(view, shadows, readActive) {
  const panel = document.getElementById('mp-authoring');
  const field = get('json'), status = get('status'), pngButton = get('mask'), downloadButton = get('download');
  const saved = new Map();
  let levelId;
  function current() {
    const { level, activePiece } = readActive();
    if (level.id === 'aquafish') throw new Error('Aquafish is excluded from pose authoring');
    return poseSnapshot(level, view, activePiece, shadows.maskSpace);
  }
  function store(pose) {
    const entry = { filename: pose.level.id + '-' + pose.capturedAt.replace(/[:.]/g, '-') + '.json', json: JSON.stringify(pose, null, 2) };
    saved.set(pose.level.id, entry);
    if (pose.level.id === levelId) {
      field.value = entry.json;
      downloadButton.disabled = false;
    }
    try { localStorage.setItem(KEY + '.' + pose.level.id, JSON.stringify(entry)); return true; }
    catch { return false; }
  }
  get('copy').addEventListener('click', async () => {
    const json = JSON.stringify(current(), null, 2);
    field.value = json;
    try { await navigator.clipboard.writeText(json); status.textContent = 'Current pose copied.'; }
    catch { field.focus(); field.select(); status.textContent = 'JSON selected. Use Ctrl+C or Cmd+C to copy.'; }
  });
  get('save').addEventListener('click', () => {
    status.textContent = store(current()) ? 'Pose saved in this browser.' : 'Pose available for download. Browser storage is unavailable.';
  });
  downloadButton.addEventListener('click', () => {
    const entry = saved.get(levelId);
    if (entry) download(entry.filename, new Blob([entry.json], { type: 'application/json' }));
  });
  pngButton.addEventListener('click', async () => {
    const requestedLevel = levelId;
    pngButton.disabled = true;
    status.textContent = 'Capturing the current cast shadow…';
    try {
      const { pose, mask } = await shadows.captureAuthoringMask(() => {
        if (levelId !== requestedLevel) throw new Error('The level changed before the shadow was captured.');
        return current();
      });
      const blob = await encodeMask(mask, pose.mask);
      const stem = pose.level.id + '-' + pose.capturedAt.replace(/[:.]/g, '-');
      pose.mask.filename = stem + '.png';
      const persisted = store(pose);
      download(pose.mask.filename, blob);
      status.textContent = persisted ? 'Shadow PNG downloaded. Matching JSON saved in this browser.' : 'Shadow PNG downloaded. Use Download saved JSON for its matching pose.';
    } catch (error) { status.textContent = error.message; }
    finally { pngButton.disabled = false; }
  });
  return {
    setLevel(level) {
      levelId = level.id;
      panel.hidden = levelId === 'aquafish';
      panel.open = false;
      if (!saved.has(levelId) && !panel.hidden) {
        try {
          const entry = JSON.parse(localStorage.getItem(KEY + '.' + levelId));
          if (typeof entry?.filename === 'string' && typeof entry.json === 'string') saved.set(levelId, entry);
        } catch {}
      }
      const entry = saved.get(levelId);
      field.value = entry?.json ?? '';
      downloadButton.disabled = !entry;
      status.textContent = entry ? 'Showing the last saved pose for this level.' : '';
    },
  };
}
