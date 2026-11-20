// Settings model: a schema, validated values, subscriptions and optional persistence. No DOM, no gameplay.
// The settings screen renders FROM the schema, so adding a setting here adds a control there.
// The game applies values by subscribing (see README, Step 3, "Integration points").

import { prefersReducedMotion } from '../dom.js';

export const SETTINGS_GROUPS = Object.freeze([
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display' },
  { id: 'gameplay', label: 'Gameplay' },
]);

const QUALITY = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];

// type: 'range' (min, max, step, unit) | 'toggle' | 'choice' (options). `default` must be valid for its type.
export const SETTINGS_SCHEMA = Object.freeze([
  { key: 'masterVolume', group: 'audio', type: 'range', label: 'Master volume', min: 0, max: 100, step: 5, unit: '%', default: 80 },
  { key: 'musicVolume', group: 'audio', type: 'range', label: 'Music volume', min: 0, max: 100, step: 5, unit: '%', default: 60 },
  { key: 'effectsVolume', group: 'audio', type: 'range', label: 'Effects volume', min: 0, max: 100, step: 5, unit: '%', default: 80 },
  { key: 'muted', group: 'audio', type: 'toggle', label: 'Mute all audio', default: false },
  { key: 'quality', group: 'display', type: 'choice', label: 'Graphics quality', options: QUALITY, default: 'high', hint: 'Lower quality renders fewer pixels and a coarser shadow map.' },
  { key: 'reduceMotion', group: 'display', type: 'toggle', label: 'Reduce motion', default: false, hint: 'Also follows your system setting.' },
  { key: 'controlHints', group: 'gameplay', type: 'toggle', label: 'Show control hints', default: true },
  { key: 'sensitivity', group: 'gameplay', type: 'range', label: 'Rotation sensitivity', min: 50, max: 150, step: 10, unit: '%', default: 100 },
].map(Object.freeze));

/** Returns the valid value for `raw`, or undefined when `raw` is not acceptable for this setting. */
export function coerce(def, raw) {
  switch (def.type) {
    case 'range': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return undefined;
      const clamped = Math.min(def.max, Math.max(def.min, n));
      const snapped = def.min + Math.round((clamped - def.min) / def.step) * def.step;
      const decimals = (String(def.step).split('.')[1] || '').length;
      return Math.min(def.max, Number(snapped.toFixed(decimals)));
    }
    case 'toggle': return typeof raw === 'boolean' ? raw : undefined;
    case 'choice': return def.options.some(option => option.value === raw) ? raw : undefined;
    default: return undefined;
  }
}

/**
 * createSettingsStore({ schema, storage, storageKey, initial, reducedMotion, warn })
 *   storage: anything with getItem/setItem (localStorage). Optional: without it values live in memory only.
 *   Unknown or invalid stored values are ignored, a failing storage never throws.
 */
export function createSettingsStore({
  schema = SETTINGS_SCHEMA, storage = null, storageKey = 'morpheus.settings', initial = {},
  reducedMotion = prefersReducedMotion, warn = (...args) => console.warn(...args),
} = {}) {
  const defs = new Map();
  for (const def of schema) {
    if (defs.has(def.key)) throw new TypeError(`[settings] duplicate key "${def.key}"`);
    if (coerce(def, def.default) !== def.default) throw new TypeError(`[settings] "${def.key}": invalid default`);
    defs.set(def.key, def);
  }
  const values = Object.fromEntries(schema.map(def => [def.key, def.default]));
  const listeners = new Set();

  const adopt = source => { // silent, used for stored and initial values
    if (!source || typeof source !== 'object') return;
    for (const [key, raw] of Object.entries(source)) {
      const def = defs.get(key); const value = def && coerce(def, raw);
      if (value !== undefined) values[key] = value;
    }
  };
  if (storage) { try { adopt(JSON.parse(storage.getItem(storageKey))); } catch { /* missing, corrupt or blocked storage: keep defaults */ } }
  adopt(initial);

  const persist = () => { if (storage) { try { storage.setItem(storageKey, JSON.stringify(values)); } catch { /* full or private mode: keep working in memory */ } } };
  const emit = change => {
    for (const fn of [...listeners]) { try { fn(change); } catch (error) { warn('[settings] subscriber threw', error); } }
  };

  const api = {
    schema, groups: SETTINGS_GROUPS,
    get(key) { if (!defs.has(key)) throw new TypeError(`[settings] unknown setting "${key}"`); return values[key]; },
    getAll: () => ({ ...values }),
    /** Applies a valid value and returns the value now in effect. Invalid values are ignored; unknown keys throw. */
    set(key, raw) {
      const def = defs.get(key); if (!def) throw new TypeError(`[settings] unknown setting "${key}"`);
      const value = coerce(def, raw);
      if (value === undefined || value === values[key]) return values[key];
      const previous = values[key]; values[key] = value; persist();
      emit({ key, value, previous });
      return value;
    },
    reset() { for (const def of schema) api.set(def.key, def.default); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Motion is reduced when the player asked for it here OR the system asks for it. Pass this to createScreenManager({ reducedMotion }). */
    reducedMotion: () => values.reduceMotion === true || !!reducedMotion(),
    get listenerCount() { return listeners.size; },
  };
  return api;
}
