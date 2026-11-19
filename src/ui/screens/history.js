// Back-stack logic. Pure data: no DOM, no timers, no knowledge of screen definitions.
//
// Rule, written for the screen being LEFT. On navigate(dest, { replace, reset }) away from S:
//   1. reset            -> the stack is emptied first.
//   2. S is pushed onto the stack only if S.record && !replace && !reset.
//   3. dest becomes current, carrying its own `record` flag (decided by the manager from
//      call option `history` ?? definition `history` ?? true).
// back() pops the top entry and makes it current (record = true). The screen left by back() is discarded.

export function createHistory() {
  let current = null;   // { id, params, record }
  let stack = [];       // back targets, oldest first: { id, params }

  return {
    get current() { return current; },
    get depth() { return stack.length; },
    peek: () => stack[stack.length - 1] ?? null,
    snapshot: () => stack.map(({ id, params }) => ({ id, params })),

    navigate(dest, { replace = false, reset = false } = {}) {
      if (reset) stack = [];
      if (current && current.record && !replace && !reset) stack.push({ id: current.id, params: current.params });
      current = { id: dest.id, params: dest.params, record: dest.record !== false };
    },

    back() {
      const entry = stack.pop();
      if (!entry) return null;
      current = { id: entry.id, params: entry.params, record: true };
      return entry;
    },

    /** Drop the top entry without navigating (used to skip entries equal to the current screen). */
    discard() { stack.pop(); },
  };
}
