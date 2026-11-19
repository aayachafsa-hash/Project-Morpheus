// ScreenManager: owns the stage, the navigation state and screen lifecycles. It never reads gameplay state.
// See src/ui/README.md ("Step 2") for the full contract. Short version:
//   go(id, params, {replace, history, reset, transitionMs})  open(id, params)  close()  back()
//   lifecycle per instance: create(ctx) -> enter(params, info) -> leave(info) -> destroy()

import { h, prefersReducedMotion } from '../dom.js';
import { backdrop as createBackdrop } from '../components/backdrop.js';
import { createRegistry } from './registry.js';
import { createHistory } from './history.js';
import { createTransitionRunner, timeoutScheduler } from './transitions.js';
import { focusInitial, focusSafely, trapTab } from './focus.js';
import { routeKey } from './keys.js';
import { createAnnouncer } from './announcer.js';

const DEFAULT_MS = 750; // = --mp-dur-screen in tokens.css

export function createScreenManager({
  root = document.body,
  backdrop: backdropOptions = {},       // false = no shared backdrop; otherwise options for backdrop()
  transitionMs = DEFAULT_MS,
  reducedMotion = prefersReducedMotion, // read at the start of every navigation
  schedule = timeoutScheduler,          // (fn, ms) => cancel; injectable so tests need no real time
  warn = (...args) => console.warn(...args),
} = {}) {
  const registry = createRegistry();
  const history = createHistory();
  const transitions = createTransitionRunner(schedule);
  const retained = new Map();   // persistent instances, key `${id}|${presentation}`
  const subscribers = new Set();
  let screenRec = null;         // record of the active screen
  let overlays = [];            // records of open overlays, bottom -> top
  let settling = null;          // { leaving: [rec], entering: [rec] } of the in-flight transition
  let destroyed = false;
  let lock = 0;                 // > 0 while the manager is mutating state (incl. while it runs user hooks)
  let flushing = false;
  const queue = [];             // requests made re-entrantly (from create/enter/leave/destroy hooks, subscribers), FIFO

  // ── Stage ──────────────────────────────────────────────────────────────
  const doc = root.ownerDocument;
  const backdropEl = backdropOptions === false ? null : createBackdrop({ variant: 'warm', ...backdropOptions });
  const screensLayer = h('div', { class: 'mp-stage__layer mp-stage__screens' });
  const overlaysLayer = h('div', { class: 'mp-stage__layer mp-stage__overlays' });
  const announcer = createAnnouncer();
  const stage = h('div', { class: 'mp-stage', 'data-mp-stage': '' }, backdropEl, screensLayer, overlaysLayer, announcer.el);
  root.append(stage);

  // ── Small helpers ──────────────────────────────────────────────────────
  const topLayer = () => overlays[overlays.length - 1] ?? screenRec;
  const allows = (def, id) => def.to === '*' || def.to.includes(id);
  const reject = (reason, extra = {}) => { warn(`[screens] rejected: ${reason}`, extra); return Promise.resolve({ ok: false, reason, ...extra }); };
  const call = (rec, hook, ...args) => {
    try { return rec.inst[hook]?.(...args); } catch (error) { warn(`[screens] "${rec.id}".${hook}() threw`, error); return undefined; }
  };
  const activeElement = () => { const a = doc.activeElement; return a && a !== doc.body && a !== doc.documentElement ? a : null; };
  const msFor = (def, opts) => {
    if (reducedMotion()) return 0;
    const ms = opts?.transitionMs ?? def.transitionMs ?? transitionMs;
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  };
  const emit = () => {
    const snapshot = { current: api.current, overlays: api.overlays };
    for (const fn of [...subscribers]) { try { fn(snapshot); } catch (error) { warn('[screens] subscriber threw', error); } }
  };

  // ── Re-entrancy ────────────────────────────────────────────────────────
  // Hooks (create/enter/leave/destroy/onKey) and subscribers may call go/open/close/back/destroy. Running those
  // in the middle of another navigation would interleave two transitions over the single `settling` slot, so a
  // request made while the manager holds the lock is queued and runs, in order, right after the current
  // operation has finished. It is validated then (against the settled state), and its promise resolves then.
  const hold = fn => { lock += 1; try { return fn(); } finally { lock -= 1; } };
  function flush() {
    if (flushing || lock > 0) return;
    flushing = true;
    try { while (queue.length) hold(queue.shift()); } finally { flushing = false; }
  }
  const exclusive = run => { // run() returns a Promise; top-level calls stay synchronous
    if (lock > 0) return new Promise(resolve => { queue.push(() => resolve(run())); });
    const result = hold(run); flush(); return result;
  };

  // ── Instances ──────────────────────────────────────────────────────────
  // One record per presentation: the same definition used as screen and as overlay gets two separate instances.
  function acquire(def, presentation, params) {
    const key = `${def.id}|${presentation}`;
    if (def.persistent && retained.has(key)) { const rec = retained.get(key); rec.params = params; return rec; }
    const cleanups = [];
    const ctx = {
      id: def.id, params, presentation, manager: api, announce: message => announcer.say(message),
      onDestroy: fn => { cleanups.push(fn); },
      listen: (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); },
    };
    const inst = def.create(ctx);
    if (!inst || inst.el?.nodeType !== 1) throw new TypeError(`[screens] "${def.id}": create(ctx) must return { el } with an element`);
    const rec = { def, id: def.id, presentation, key, inst, cleanups, wrapper: null, params, opener: null, lastFocus: null };
    if (def.persistent) retained.set(key, rec);
    return rec;
  }

  function dispose(rec) { // final teardown of one instance
    call(rec, 'destroy');
    for (const fn of rec.cleanups.splice(0).reverse()) { try { fn(); } catch (error) { warn('[screens] cleanup threw', error); } }
    retained.delete(rec.key);
    rec.wrapper?.remove(); rec.wrapper = null;
  }

  function mount(rec, layerEl) {
    rec.wrapper = h('div', { class: 'mp-screen', 'data-screen': rec.id, 'data-layer': rec.presentation, 'data-state': 'active', 'data-keys': rec.def.keys, tabindex: '-1' });
    rec.wrapper.append(rec.inst.el);
    layerEl.append(rec.wrapper);
  }

  function retire(rec) { // a leaving instance whose transition is over
    if (rec.def.persistent) { rec.inst.el.remove(); rec.wrapper?.remove(); rec.wrapper = null; } // DOM and listeners retained
    else dispose(rec);
  }

  const setInert = (wrapper, on) => {
    if (!wrapper) return;
    if (on) { wrapper.setAttribute('inert', ''); wrapper.setAttribute('aria-hidden', 'true'); }
    else { wrapper.removeAttribute('inert'); wrapper.removeAttribute('aria-hidden'); }
  };
  const syncLayers = () => { // only the topmost layer is interactive
    const layers = [screenRec, ...overlays].filter(Boolean);
    layers.forEach((rec, i) => setInert(rec.wrapper, i !== layers.length - 1));
  };

  // ── Transitions ────────────────────────────────────────────────────────
  function settle() { // make the in-flight transition's end state real; idempotent
    const s = settling; settling = null;
    if (!s) return;
    s.leaving.forEach(retire);
    s.entering.forEach(rec => { if (rec.wrapper) rec.wrapper.dataset.state = 'active'; });
  }

  function startTransition(ms, leaving, entering) {
    settling = { leaving, entering };
    for (const rec of leaving) { setInert(rec.wrapper, true); if (ms > 0) rec.wrapper.dataset.state = 'leaving'; }
    if (ms > 0) for (const rec of entering) rec.wrapper.dataset.state = 'entering';
    stage.style.setProperty('--mp-screen-ms', `${ms}ms`);
    return new Promise(resolve => transitions.start(ms, interrupted => {
      hold(settle);                                // retire() runs destroy hooks: keep them from re-entering mid-settle
      resolve(interrupted ? { ok: true, interrupted: true } : { ok: true });
      flush();                                     // no-op while a navigation is still on the stack; runs queued requests after a timer-driven finish
    }));
  }

  // ── Backdrop, announcements, focus ─────────────────────────────────────
  function applyBackdrop(def) {
    if (!backdropEl) return;
    if (def.backdrop === false) { backdropEl.style.display = 'none'; return; }
    backdropEl.style.display = ''; backdropEl.dataset.variant = def.backdrop;
  }
  function announceFor(rec) {
    try {
      const title = typeof rec.def.title === 'function' ? rec.def.title(rec.params) : rec.def.title;
      if (title) announcer.say(title);
    } catch (error) { warn(`[screens] "${rec.id}" title() threw`, error); }
  }
  function rememberFocus(rec) { const a = activeElement(); if (a && rec.wrapper?.contains(a)) rec.lastFocus = a; }
  function focusInto(rec) {
    const w = rec.wrapper; if (!w) return;
    if (rec.def.persistent && rec.lastFocus?.isConnected && w.contains(rec.lastFocus) && focusSafely(rec.lastFocus)) return;
    // Gameplay-style screens keep focus where it is unless they ask for a target explicitly.
    if (rec.def.keys === 'passthrough' && rec.inst.initialFocus == null) return;
    focusInitial(w, rec.inst.initialFocus);
  }
  function restoreFocus(closed) {
    const target = closed.opener; closed.opener = null;
    if (target && target.isConnected && !target.closest('[inert]') && focusSafely(target)) return;
    const below = topLayer(); if (below) focusInto(below);
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  function navigate(def, params, opts, reason, applyHistory) {
    transitions.interrupt();                       // finish any running transition first: at most one in flight
    let rec;
    try { rec = acquire(def, 'screen', params); }
    catch (error) { warn(`[screens] "${def.id}" create() failed`, error); return Promise.resolve({ ok: false, reason: 'create-failed', error }); }

    const leaving = [];
    for (const overlay of [...overlays].reverse()) { call(overlay, 'leave', { to: def.id, reason }); leaving.push(overlay); }
    overlays = [];
    const previous = screenRec;
    if (previous) { rememberFocus(previous); call(previous, 'leave', { to: def.id, reason }); leaving.push(previous); }

    applyHistory();
    screenRec = rec;
    mount(rec, screensLayer);
    applyBackdrop(def);
    call(rec, 'enter', params, { from: previous?.id ?? null, reason, presentation: 'screen' });
    announceFor(rec);
    const done = startTransition(msFor(def, opts), leaving, [rec]);
    syncLayers();
    focusInto(rec);
    emit();
    return done;
  }

  function goNow(id, params = {}, opts = {}) {
    if (destroyed) return reject('destroyed');
    const def = registry.get(id);
    if (!def) return reject('not-registered', { id });
    if (def.presentation === 'overlay') return reject('wrong-presentation', { id });
    const from = topLayer();
    if (from && !allows(from.def, id)) return reject('not-allowed', { from: from.id, id });
    if (screenRec && screenRec.id === id) return reject('same-screen', { id });
    const record = opts.history ?? def.history;
    return navigate(def, params, opts, 'go',
      () => history.navigate({ id, params, record: record !== false }, { replace: !!opts.replace, reset: !!opts.reset }));
  }

  function openNow(id, params = {}, opts = {}) {
    if (destroyed) return reject('destroyed');
    const def = registry.get(id);
    if (!def) return reject('not-registered', { id });
    if (def.presentation === 'screen') return reject('wrong-presentation', { id });
    const from = topLayer();
    if (!from) return reject('no-screen', { id });
    if (!allows(from.def, id)) return reject('not-allowed', { from: from.id, id });
    if (screenRec.id === id || overlays.some(o => o.id === id)) return reject('already-open', { id });

    transitions.interrupt();
    let rec;
    try { rec = acquire(def, 'overlay', params); }
    catch (error) { warn(`[screens] "${def.id}" create() failed`, error); return Promise.resolve({ ok: false, reason: 'create-failed', error }); }

    rec.opener = opts.opener ?? activeElement();
    overlays.push(rec);
    mount(rec, overlaysLayer);
    call(rec, 'enter', params, { from: from.id, reason: 'open', presentation: 'overlay' });
    announceFor(rec);
    const done = startTransition(msFor(def, opts), [], [rec]);
    syncLayers();
    focusInto(rec);
    emit();
    return done;
  }

  function closeNow(opts = {}) {
    if (destroyed) return reject('destroyed');
    if (!overlays.length) return reject('no-overlay');
    transitions.interrupt();
    const rec = overlays.pop();
    call(rec, 'leave', { to: topLayer()?.id ?? null, reason: 'close' });
    const done = startTransition(msFor(rec.def, opts), [rec], []);
    syncLayers();
    restoreFocus(rec);
    emit();
    return done;
  }

  function backNow(opts = {}) {
    if (destroyed) return reject('destroyed');
    if (overlays.length) return closeNow(opts);
    while (history.peek() && screenRec && history.peek().id === screenRec.id) history.discard(); // never "back" onto the same screen
    const entry = history.peek();
    if (!entry) return reject('empty-history');
    const def = registry.get(entry.id);
    if (!def) return reject('not-registered', { id: entry.id });
    return navigate(def, entry.params, opts, 'back', () => history.back());
  }

  const go = (id, params, opts) => exclusive(() => goNow(id, params, opts));
  const open = (id, params, opts) => exclusive(() => openNow(id, params, opts));
  const close = opts => exclusive(() => closeNow(opts));
  const back = opts => exclusive(() => backNow(opts));

  // ── Declarative navigation: data-go / data-open / data-back / data-close ─
  function readParams(el) {
    const raw = el.getAttribute('data-params');
    if (raw == null) return {};
    try { return JSON.parse(raw); } catch { warn('[screens] ignored invalid data-params JSON', raw); return {}; }
  }
  function onClick(event) {
    const el = event.target?.closest?.('[data-go],[data-open],[data-back],[data-close]');
    const layer = topLayer();
    if (!el || !layer?.wrapper?.contains(el) || el.closest('.mp-screen') !== layer.wrapper) return; // only the interactive layer navigates
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return;
    event.preventDefault();
    const flags = { replace: el.hasAttribute('data-replace'), reset: el.hasAttribute('data-reset') };
    if (el.hasAttribute('data-no-history')) flags.history = false;
    if (el.hasAttribute('data-go')) go(el.getAttribute('data-go'), readParams(el), flags);
    else if (el.hasAttribute('data-open')) open(el.getAttribute('data-open'), readParams(el), { opener: el });
    else if (el.hasAttribute('data-back')) back();
    else close();
  }

  // ── Keyboard: one document-level listener, bubble phase, never stops propagation ─
  function onKeydown(event) {
    const layer = topLayer();
    const result = routeKey(event, layer, {
      onKey: (l, e) => call(l, 'onKey', e, api),
      back: () => back(),
      canGoBack: () => history.depth > 0,
    });
    if (result === 'unhandled' && event.key === 'Tab' && layer.presentation === 'overlay') trapTab(layer.wrapper, event);
  }
  stage.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKeydown);

  // ── Public API ─────────────────────────────────────────────────────────
  function destroyNow() {
    if (destroyed) return;
    transitions.interrupt();
    for (const overlay of [...overlays].reverse()) call(overlay, 'leave', { to: null, reason: 'destroy' });
    if (screenRec) call(screenRec, 'leave', { to: null, reason: 'destroy' });
    const all = new Set([...overlays, screenRec, ...retained.values()].filter(Boolean));
    overlays = []; screenRec = null; destroyed = true;
    all.forEach(dispose);
    stage.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKeydown);
    backdropEl?.destroy();
    announcer.destroy();
    stage.remove();
    subscribers.clear();
  }
  function destroy() { // from a hook it is deferred until the running operation is done; queued requests then see `destroyed`
    if (lock > 0) { queue.push(destroyNow); return; }
    hold(destroyNow); flush();
  }

  const api = {
    register(defs) { [].concat(defs).forEach(def => registry.register(def)); return api; },
    validate: () => registry.problems(),
    has: id => registry.has(id),
    go, open, close, back, destroy,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    get current() { const c = history.current; return c ? { id: c.id, params: c.params } : null; },
    get overlays() { return overlays.map(o => o.id); },
    get history() { return history.snapshot(); },
    get canGoBack() { return overlays.length > 0 || history.depth > 0; },
    get transitioning() { return transitions.busy; },
    stage, backdrop: backdropEl,
  };
  return api;
}
