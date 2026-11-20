// Results: one definition, two states. Everything shown comes from the params it is opened with; it never
// computes a score, a star count or a next level. Anything missing is simply not rendered.
//
//   ui.go('results', { outcome: 'success' | 'failure', level, levelName?, score?, target?, stars?, nextLevel? })
//
// Only outcome === 'success' counts as success: a missing or unknown outcome is shown as a failure.
// actions.retry(params)  actions.next(params)  actions.levels(params)  actions.mainMenu(params)

import { h, uid } from '../dom.js';
import { goldButton, laurelTitle, statBadge, starRating, glassPanel } from '../components/index.js';
import { MAX_STARS } from './levels.js';

const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function normalizeResult(params) {
  const p = params ?? {};
  const success = p.outcome === 'success';
  return {
    outcome: success ? 'success' : 'failure',
    level: p.level ?? null,
    levelName: typeof p.levelName === 'string' && p.levelName ? p.levelName : null,
    score: finite(p.score), target: finite(p.target),
    stars: success ? finite(p.stars) : null,
    nextLevel: success && p.nextLevel != null ? p.nextLevel : null,
  };
}

export function resultsScreen({ ids, actions } = {}) {
  return {
    id: ids.results, to: [ids.game, ids.levelSelect, ids.mainMenu], history: false, backdrop: 'win',
    title: params => (normalizeResult(params).outcome === 'success' ? 'Puzzle completed' : 'Puzzle failed'),
    create(ctx) {
      const result = normalizeResult(ctx.params);
      const success = result.outcome === 'success';
      const titleId = uid('mp-gs-title');

      const details = [
        result.score != null && statBadge({ label: 'MATCH', value: result.score, tone: success ? 'teal' : 'neutral' }),
        result.target != null && h('p', { class: 'mp-text-caption' }, success ? `Target ${result.target}%` : `Needed ${result.target}% to complete`),
        result.stars != null && starRating({ value: result.stars, max: MAX_STARS, size: 28 }),
      ].filter(Boolean);

      const primary = (label, onClick) => { const b = goldButton({ label, onClick }); b.classList.add('mp-gs-primary'); return b; };
      const secondary = (label, onClick) => goldButton({ label, onClick, tone: 'quiet', chevron: false });
      const buttons = success
        ? [result.nextLevel != null && primary('Next level', () => actions.next?.(ctx.params)), secondary('Retry', () => actions.retry?.(ctx.params))]
        : [primary('Retry', () => actions.retry?.(ctx.params))];
      if (success && result.nextLevel == null) buttons[1].classList.add('mp-gs-primary'); // nothing to advance to: Retry becomes the main action
      buttons.push(secondary('Levels', () => actions.levels?.(ctx.params)), secondary('Main menu', () => actions.mainMenu?.(ctx.params)));

      const el = h('section', { class: 'mp-gs-screen mp-gs-results', 'data-outcome': result.outcome, 'aria-labelledby': titleId },
        h('div', { class: 'mp-gs-stack mp-gs-stack--center mp-gs-stack--results' },
          h('div', { class: 'mp-gs-brand' },
            laurelTitle({ text: success ? 'Puzzle completed' : 'Puzzle failed', tone: success ? 'gold' : 'fail', id: titleId }),
            result.levelName && h('p', { class: 'mp-text-body' }, result.levelName)),
          details.length > 0 && glassPanel({ className: 'mp-gs-panel mp-gs-score', label: 'Result', role: 'group', children: details }),
          h('div', { class: 'mp-gs-menu' }, buttons)));

      return {
        el, initialFocus: '.mp-gs-primary',
        // The backdrop variant is fixed per definition by the manager (`win`), so a failure sets its own variant on entry.
        // Every later navigation re-applies its own variant, so nothing leaks into the next screen.
        enter() { ctx.manager.backdrop?.setAttribute('data-variant', success ? 'win' : 'fail'); },
      };
    },
  };
}
