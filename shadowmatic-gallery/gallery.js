import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const loader = new GLTFLoader();
const cache = new Map();
let entries = [], selected = '', selectionToken = 0;
const material = new THREE.MeshStandardMaterial({ color: '#b7c595', roughness: .57, metalness: .12, side: THREE.DoubleSide });
const thumbMaterial = material.clone();

function studio(renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe7f1da, 0x424b37, 2.2));
  for (const [color, power, position] of [[0xffecd3, 4, [3, 5, 4]], [0xc2d8ed, 2, [-4, 2, 1]], [0xd6e8a9, 3, [1, 3, -4]]]) {
    const light = new THREE.DirectionalLight(color, power);
    light.position.set(...position); scene.add(light);
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshStandardMaterial({ color: 0x293323, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.02; scene.add(ground);
  // Soft contact shading without an external texture dependency.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(0,0,0,.6)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.01; scene.add(shadow);
  return scene;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
$('viewer').append(renderer.domElement);
const scene = studio(renderer);
const camera = new THREE.PerspectiveCamera(36, 1, .01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1;
controls.minDistance = 1.6; controls.maxDistance = 12;
let active;
function resetView() {
  const sphere = active ? new THREE.Box3().setFromObject(active).getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.35);
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = sphere.radius / Math.sin(Math.min(vertical, horizontal)) * 1.12;
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(3.2, 1.8, 4.2).normalize(), distance);
  controls.update();
}
resetView();
new ResizeObserver(() => {
  const { width, height } = $('viewer').getBoundingClientRect();
  if (!width || !height) return;
  // Supersample ordinary screens too, with a pixel budget for expanded views.
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio || 1, 2), 3, Math.sqrt(8000000 / (width * height))));
  renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  resetView();
}).observe($('viewer'));
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

function modelURL(entry, kind = 'glb') {
  return `./${kind}/${entry.name.split('\\').join('/').split('/').map(encodeURIComponent).join('/')}.${kind}`;
}
function load(entry) {
  if (!cache.has(entry.name)) {
    cache.set(entry.name, loader.loadAsync(modelURL(entry)).then(gltf => {
      const object = gltf.scene;
      object.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.computeVertexNormals(); mesh.material.dispose(); mesh.material = material; } });
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const scale = 2 / Math.max(size.x, size.y, size.z, .001);
      const center = box.getCenter(new THREE.Vector3());
      object.scale.setScalar(scale); object.position.copy(center).multiplyScalar(-scale);
      object.position.y += size.y * scale / 2 - 1;
      const group = new THREE.Group(); group.add(object);
      return group;
    }).catch(error => { cache.delete(entry.name); throw error; }));
  }
  return cache.get(entry.name);
}

async function select(entry) {
  selected = entry.name; const token = ++selectionToken;
  document.querySelectorAll('.card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.name === selected)));
  $('title').textContent = entry.label; $('group').textContent = entry.category;
  $('path').textContent = entry.name.split('\\').join('/');
  $('vertices').textContent = entry.vertices.toLocaleString(); $('triangles').textContent = entry.triangles.toLocaleString();
  $('glb').href = modelURL(entry); $('obj').href = modelURL(entry, 'obj');
  $('glb').hidden = $('obj').hidden = false;
  if (active) { scene.remove(active); active = null; }
  $('path').classList.remove('error');
  try {
    const model = await load(entry);
    if (token !== selectionToken) return;
    active = model.clone(true); scene.add(active); resetView();
  } catch (error) {
    if (token !== selectionToken) return;
    $('path').textContent = 'Could not load this mesh. Check the local server and file path.'; $('path').classList.add('error');
    console.error(error);
  }
}

// One shared thumbnail context; only visible cards are queued for rendering.
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
const thumbScene = studio(thumbRenderer); thumbRenderer.setPixelRatio(1); thumbRenderer.setSize(720, 600);
const thumbCamera = new THREE.PerspectiveCamera(36, 720 / 600, .01, 100);
thumbCamera.position.set(3.2, 1.8, 4.2); thumbCamera.lookAt(0, -.05, 0);
const queue = []; const images = new Map(); const pending = new Set(); let processing = false;
async function processQueue() {
  if (processing) return; processing = true;
  while (queue.length) {
    const { entry, holder } = queue.shift();
    if (!holder.isConnected) { pending.delete(entry.name); continue; }
    let model;
    try {
      model = (await load(entry)).clone(true);
      model.traverse(mesh => { if (mesh.isMesh) mesh.material = thumbMaterial; });
      thumbScene.add(model); thumbRenderer.render(thumbScene, thumbCamera);
      const url = thumbRenderer.domElement.toDataURL('image/webp', .96); images.set(entry.name, url);
      showImage(holder, url, entry.label);
    } catch (error) { holder.textContent = 'Preview unavailable'; console.error(entry.name, error); }
    finally { if (model) thumbScene.remove(model); pending.delete(entry.name); }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  processing = false;
}
function showImage(holder, url, label) {
  const img = new Image(); img.alt = label; img.src = url; holder.replaceChildren(img);
}
const observer = new IntersectionObserver(items => {
  for (const item of items) {
    if (!item.isIntersecting) continue;
    observer.unobserve(item.target);
    const entry = entries.find(e => e.name === item.target.dataset.name);
    if (images.has(entry.name)) showImage(item.target, images.get(entry.name), entry.label);
    else if (!pending.has(entry.name)) { pending.add(entry.name); queue.push({ entry, holder: item.target }); }
  }
  processQueue();
}, { rootMargin: '180px' });

function renderCards() {
  observer.disconnect(); queue.length = 0; pending.clear();
  const query = $('search').value.trim().toLowerCase();
  const filtered = entries.filter(e => e.name.toLowerCase().includes(query) && ($('category').value === 'all' || e.category === $('category').value));
  filtered.sort($('sort').value === 'complexity' ? (a, b) => b.triangles - a.triangles : (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  $('grid').replaceChildren(); $('status').textContent = `${filtered.length} of ${entries.length} shapes · Select any shape to inspect`;
  $('empty').hidden = !!filtered.length;
  const fragment = document.createDocumentFragment();
  for (const entry of filtered) {
    const card = document.createElement('button'); card.className = 'card'; card.dataset.name = entry.name;
    card.setAttribute('aria-pressed', String(entry.name === selected)); card.setAttribute('aria-label', `Inspect ${entry.label}`);
    const holder = document.createElement('div'); holder.className = 'preview'; holder.dataset.name = entry.name; holder.textContent = 'Loading preview…';
    const caption = document.createElement('div'); caption.className = 'caption';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = entry.label;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${entry.category} · ${entry.triangles.toLocaleString()} faces`;
    caption.append(name, meta); card.append(holder, caption); card.addEventListener('click', () => select(entry)); fragment.append(card);
    if (images.has(entry.name)) showImage(holder, images.get(entry.name), entry.label); else observer.observe(holder);
  }
  $('grid').append(fragment);
}
$('search').addEventListener('input', renderCards); $('category').addEventListener('change', renderCards); $('sort').addEventListener('change', renderCards);
$('rotate').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('rotate').setAttribute('aria-pressed', String(controls.autoRotate)); });
$('wire').addEventListener('click', () => { material.wireframe = !material.wireframe; $('wire').setAttribute('aria-pressed', String(material.wireframe)); });
$('reset').addEventListener('click', resetView);
function expandPreview(expanded) {
  $('viewer').classList.toggle('expanded', expanded);
  document.body.classList.toggle('preview-expanded', expanded);
  $('expand').setAttribute('aria-pressed', String(expanded));
  $('expand').textContent = expanded ? 'Close preview · Esc' : 'Expand preview';
  $('expand').focus();
}
$('expand').addEventListener('click', () => expandPreview(!$('viewer').classList.contains('expanded')));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('viewer').classList.contains('expanded')) expandPreview(false);
});
$('color').addEventListener('input', event => material.color.set(event.target.value));

try {
  if (location.protocol === 'file:') throw new Error('Open this gallery through a local HTTP server. See GALLERY-README.txt.');
  const response = await fetch('./manifest.json'); if (!response.ok) throw new Error(`Mesh index returned ${response.status}`);
  entries = (await response.json()).map(entry => {
    const parts = entry.name.split(/[\\/]/);
    return { ...entry, label: parts.at(-1), category: parts.length > 2 ? parts.slice(1, -1).join(' / ') : 'Original shapes' };
  });
  for (const category of [...new Set(entries.map(e => e.category))].sort()) {
    const option = document.createElement('option'); option.value = option.textContent = category; $('category').append(option);
  }
  $('total').textContent = `${entries.length} shapes / ${entries.reduce((sum, e) => sum + e.triangles, 0).toLocaleString()} faces`;
  renderCards(); const first = entries.find(e => /airplane1$/.test(e.name)) || entries[0]; if (first) select(first);
} catch (error) { $('status').textContent = error.message; $('status').classList.add('error'); console.error(error); }
