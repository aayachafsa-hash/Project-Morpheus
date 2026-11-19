// Screen definitions: validation, defaults, lookup. No DOM.

const PRESENTATIONS = ['screen', 'overlay', 'both'];
const KEY_MODES = ['manager', 'passthrough'];
export const BACKDROP_VARIANTS = ['warm', 'dim', 'fail', 'win'];

export function normalizeDefinition(def) {
  const fail = message => { throw new TypeError(`[screens] ${def && def.id ? `"${def.id}": ` : ''}${message}`); };
  if (!def || typeof def !== 'object') fail('a screen definition must be an object');
  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) fail('id must be lowercase kebab-case, e.g. "main-menu"');
  if (typeof def.create !== 'function') fail('create(ctx) is required');
  const to = def.to;
  if (to !== '*' && !(Array.isArray(to) && to.every(t => typeof t === 'string' && t))) fail("`to` is required: an array of screen ids, or '*'");

  const presentation = def.presentation ?? 'screen';
  if (!PRESENTATIONS.includes(presentation)) fail(`presentation must be one of ${PRESENTATIONS.join(', ')}`);
  const keys = def.keys ?? 'manager';
  if (!KEY_MODES.includes(keys)) fail(`keys must be one of ${KEY_MODES.join(', ')}`);
  if (keys === 'passthrough' && presentation !== 'screen') fail("keys:'passthrough' is only valid for presentation 'screen' (overlays are modal)");
  const backdrop = def.backdrop ?? 'warm';
  if (backdrop !== false && !BACKDROP_VARIANTS.includes(backdrop)) fail(`backdrop must be false or one of ${BACKDROP_VARIANTS.join(', ')}`);
  if (def.transitionMs != null && !(Number.isFinite(def.transitionMs) && def.transitionMs >= 0)) fail('transitionMs must be a number >= 0');
  if (def.title != null && typeof def.title !== 'string' && typeof def.title !== 'function') fail('title must be a string or a function(params) returning a string');
  for (const flag of ['persistent', 'escape', 'history']) {
    if (def[flag] != null && typeof def[flag] !== 'boolean') fail(`${flag} must be a boolean`);
  }

  return Object.freeze({
    id: def.id, title: def.title, to: to === '*' ? '*' : Object.freeze([...to]),
    presentation, keys, backdrop, create: def.create, transitionMs: def.transitionMs,
    persistent: def.persistent ?? false, escape: def.escape ?? true, history: def.history ?? true,
  });
}

export function createRegistry() {
  const defs = new Map();
  return {
    register(raw) {
      const def = normalizeDefinition(raw);
      if (defs.has(def.id)) throw new TypeError(`[screens] "${def.id}" is already registered`);
      defs.set(def.id, def);
      return def;
    },
    get: id => defs.get(id),
    has: id => defs.has(id),
    ids: () => [...defs.keys()],
    /** Destinations named in a `to` list that were never registered. Call once all screens are registered. */
    problems() {
      const out = [];
      for (const def of defs.values()) {
        if (def.to === '*') continue;
        for (const to of def.to) if (!defs.has(to)) out.push({ from: def.id, to, issue: 'unregistered-destination' });
      }
      return out;
    },
  };
}
