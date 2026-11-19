// One transition at a time. The runner only counts time; the manager decides what "finished" means.
// finish is idempotent and interruptible: interrupt() completes the running transition immediately.

export const timeoutScheduler = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };

export function createTransitionRunner(schedule = timeoutScheduler) {
  let running = null;

  const finish = interrupted => {
    if (!running) return false;
    const t = running; running = null;
    t.cancel();
    t.done(interrupted);
    return true;
  };

  return {
    get busy() { return running !== null; },
    /** Complete the running transition right now (its `done(true)` runs). Returns whether one was running. */
    interrupt: () => finish(true),
    /** ms <= 0 completes synchronously, with no timer. done(interrupted) is called exactly once. */
    start(ms, done) {
      finish(true);
      if (!(ms > 0)) { done(false); return; }
      running = { done, cancel: schedule(() => finish(false), ms) };
    },
  };
}
