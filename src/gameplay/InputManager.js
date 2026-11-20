// Per-player keyboard routing for the local duel.
// - Uses physical key codes (event.code), so ShiftLeft / ShiftRight are distinct
//   and the bindings do not depend on the keyboard layout (AZERTY / QWERTY).
// - Continuous actions (move, rotate...) are "held"; one-shot actions
//   (cycleAxis, switchObject) are queued once per key press, never on auto-repeat.
// - Keys are only captured (preventDefault) while the duel has enabled input.
// - Held keys and queued actions are cleared on blur, tab switch and when disabled.

const ONE_SHOT = new Set(['cycleAxis', 'switchObject']);

function isEditable(element) {
  return Boolean(element) && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
}

export function createInputManager({
  bindings,
  target = window,
  doc = typeof document === 'undefined' ? null : document,
}) {
  const playerIds = Object.keys(bindings);
  const lookup = new Map(); // key code -> { player, action }
  playerIds.forEach((id, player) => {
    for (const [action, code] of Object.entries(bindings[id])) {
      if (lookup.has(code)) throw new Error(`Key ${code} is bound twice (${id}: ${action}).`);
      lookup.set(code, { player, action });
    }
  });

  const held = playerIds.map(() => new Set());
  const queued = playerIds.map(() => []);
  let enabled = false;

  function clear() {
    for (const set of held) set.clear();
    for (const list of queued) list.length = 0;
  }

  function onKeyDown(event) {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
    const bound = lookup.get(event.code);
    if (!bound) return;
    event.preventDefault();
    if (ONE_SHOT.has(bound.action)) {
      if (!event.repeat) queued[bound.player].push(bound.action);
      return;
    }
    held[bound.player].add(bound.action);
  }

  function onKeyUp(event) {
    // Always release, even while disabled, so no key stays stuck.
    const bound = lookup.get(event.code);
    if (bound) held[bound.player].delete(bound.action);
  }

  function onVisibility() {
    if (doc?.hidden) clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    setEnabled(value) {
      if (enabled === value) return;
      enabled = value;
      clear();
    },
    clear,
    // Continuous input of one player as numbers in {-1, 0, 1}.
    getAxes(player) {
      const keys = held[player];
      return {
        x: Number(keys.has('right')) - Number(keys.has('left')),
        z: Number(keys.has('back')) - Number(keys.has('forward')),
        y: Number(keys.has('up')) - Number(keys.has('down')),
        turn: Number(keys.has('rotateRight')) - Number(keys.has('rotateLeft')),
        precision: keys.has('precision'),
      };
    },
    // One-shot actions pressed since the last call.
    consumeActions(player) {
      return queued[player].splice(0);
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', clear);
      doc?.removeEventListener('visibilitychange', onVisibility);
      clear();
    },
  };
}
