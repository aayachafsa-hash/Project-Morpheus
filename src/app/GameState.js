const transitions = {
  loading: ['mainMenu'],
  mainMenu: ['playing'],
  playing: ['paused', 'solved', 'mainMenu'],
  paused: ['playing', 'mainMenu'],
  solved: ['playing', 'mainMenu'],
};

export function createGameState() {
  let state = 'loading';
  const layers = [];
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn());
  return {
    get state() { return state; },
    get top() { return layers.at(-1); },
    get canSimulate() { return state === 'playing' && !layers.length; },
    go(next) {
      if (!transitions[state].includes(next)) return false;
      state = next;
      notify();
      return true;
    },
    open(id) {
      if (layers.includes(id) || (id === 'pause' && state !== 'paused') ||
          (id === 'results' && state !== 'solved')) return false;
      layers.push(id);
      notify();
      return true;
    },
    close(id) {
      if (layers.at(-1) !== id) return false;
      layers.pop();
      notify();
      return true;
    },
    escape() {
      return layers.length ? { close: layers.at(-1) } : state === 'playing' ? { open: 'pause' } : null;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
