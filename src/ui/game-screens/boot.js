// Boot / loading screen. Presentation + a tiny load runner. It never navigates by itself: when loading
// is done it calls actions.complete(), and the wiring layer decides where that goes (the main menu).

import { h, uid } from '../dom.js';
import { progressBar, goldButton } from '../components/index.js';
import { timeoutScheduler } from '../screens/transitions.js';

const clampPercent = value => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * Runs `load({ progress })` and reports when it is finished AND `minDurationMs` has passed, so the brand never flashes.
 *   progress(percent 0..100, message?)   optional, called by the loader
 * Returns cancel(): afterwards nothing is reported. Exported for tests; the screen below is its only user.
 */
export function runBoot({ load, minDurationMs, schedule, onProgress, onDone, onError }) {
  let cancelled = false, loaded = false, waited = !(minDurationMs > 0), finished = false;
  let cancelWait = () => {};
  const maybeDone = () => { if (!cancelled && !finished && loaded && waited) { finished = true; onDone(); } };
  if (!waited) cancelWait = schedule(() => { waited = true; maybeDone(); }, minDurationMs);
  Promise.resolve()
    .then(() => load({ progress: (percent, message) => { if (!cancelled) onProgress(clampPercent(percent), message); } }))
    .then(() => { if (cancelled) return; loaded = true; onProgress(100); maybeDone(); })
    .catch(error => { if (cancelled) return; cancelWait(); finished = true; onError(error); });
  return () => { cancelled = true; cancelWait(); };
}

/**
 * bootScreen({ ids, actions, load, minDurationMs, schedule, tagline })
 *   actions.complete()        loading finished
 *   actions.failed(error)     loading failed (the screen shows a Retry button)
 *   load                      async ({ progress }) => void: the integration point for real asset loading (Step 4)
 */
export function bootScreen({ ids, actions, load = async () => {}, minDurationMs = 1400, schedule = timeoutScheduler, tagline = 'A shadow puzzle' } = {}) {
  return {
    id: ids.boot, title: 'Loading Morpheus', to: [ids.mainMenu], history: false, escape: false, backdrop: 'dim',
    create(ctx) {
      const titleId = uid('mp-gs-title');
      const bar = progressBar({ label: 'Loading' });
      const status = h('p', { class: 'mp-text-caption mp-gs-boot__status' }, 'Preparing the light…');
      const loading = h('div', { class: 'mp-gs-boot__loading' }, bar, status);
      const retry = goldButton({ label: 'Retry', onClick: () => start() });
      const failure = h('div', { class: 'mp-gs-boot__failure', role: 'alert', hidden: true },
        h('p', { class: 'mp-text-body' }, 'Morpheus could not finish loading. Check your connection and try again.'), retry);
      const el = h('section', { class: 'mp-gs-screen mp-gs-boot', 'aria-labelledby': titleId, 'aria-busy': 'true' },
        h('div', { class: 'mp-gs-stack mp-gs-stack--center' },
          h('div', { class: 'mp-gs-boot__brand' }, h('h1', { class: 'mp-text-display mp-gs-hero', id: titleId }, 'Morpheus'), h('p', { class: 'mp-text-caption' }, tagline)),
          loading, failure));

      let cancel = null;
      const show = failed => { loading.hidden = failed; failure.hidden = !failed; el.setAttribute('aria-busy', String(!failed && !el.dataset.ready)); };
      function start() {
        cancel?.(); delete el.dataset.ready; show(false); bar.update(0); status.textContent = 'Preparing the light…';
        cancel = runBoot({
          load, minDurationMs, schedule,
          onProgress: (percent, message) => { bar.update(percent); if (message) status.textContent = message; },
          onDone: () => { el.dataset.ready = 'true'; el.setAttribute('aria-busy', 'false'); status.textContent = 'Ready'; actions.complete?.(); },
          onError: error => { show(true); retry.focus(); actions.failed?.(error); },
        });
      }
      ctx.onDestroy(() => cancel?.());
      return { el, enter: start, leave: () => cancel?.() };
    },
  };
}
