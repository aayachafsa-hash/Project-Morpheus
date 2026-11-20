// Level list logic for the level-select screen. Pure data in, pure data out: no DOM, no gameplay, no save system.
// The caller owns the catalogue and the progress; this only decides how each level should be DISPLAYED.

export const MAX_STARS = 3;

// The one playable level of the current prototype (assets/aquafish.glb). Replace through the `levels` option.
export const PROTOTYPE_LEVELS = Object.freeze([Object.freeze({ id: 'aquafish', name: 'Aquafish', iconName: 'fish' })]);

const STATES = ['locked', 'available', 'current', 'complete'];

/**
 * resolveLevels(levels, progress) -> [{ id, number, name, iconName, state, stars, locked }]
 *   levels:   array | () => array of { id, name?, iconName?, state? }   (order = play order)
 *   progress: object | () => object of { completed?: { [id]: stars }, unlocked?: id[], unlockAll?: boolean }
 * Rules: a level with an explicit valid `state` keeps it. Otherwise it is `complete` when it is in `completed`,
 * unlocked when it is the first level, follows a completed one, or is listed in `unlocked`/`unlockAll`,
 * and `locked` otherwise. The first unlocked level that is not complete is `current`.
 */
export function resolveLevels(levels, progress) {
  const list = (typeof levels === 'function' ? levels() : levels) ?? [];
  const prog = (typeof progress === 'function' ? progress() : progress) ?? {};
  if (!Array.isArray(list)) throw new TypeError('[levels] levels must be an array');
  const completed = prog.completed ?? {};
  const extra = new Set(prog.unlocked ?? []);
  let previousDone = true; let currentTaken = false;

  const resolved = list.map((level, index) => {
    if (!level || (typeof level.id !== 'string' && typeof level.id !== 'number')) throw new TypeError(`[levels] level #${index + 1} needs a string or number id`);
    const done = Object.hasOwn(completed, level.id);
    let state;
    if (STATES.includes(level.state)) state = level.state;
    else if (done) state = 'complete';
    else if (previousDone || prog.unlockAll || extra.has(level.id)) state = currentTaken ? 'available' : 'current';
    else state = 'locked';
    if (state === 'current') currentTaken = true;
    previousDone = done || state === 'complete';
    const stars = state === 'complete' ? Math.min(MAX_STARS, Math.max(0, Math.round(Number(completed[level.id]) || 0))) : 0;
    return { id: level.id, number: index + 1, name: level.name ?? '', iconName: level.iconName, state, stars, locked: state === 'locked' };
  });
  return resolved;
}

export const summarizeLevels = resolved => ({
  total: resolved.length,
  unlocked: resolved.filter(level => !level.locked).length,
  stars: resolved.reduce((sum, level) => sum + level.stars, 0),
  maxStars: resolved.length * MAX_STARS,
});
