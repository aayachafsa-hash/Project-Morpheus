// Level selection. Tiles come from the existing levelTile component; which levels exist and which are locked is
// decided by levels.js from the data the caller passes. A locked tile can be focused but never selected.
// actions.select(level)  actions.back()

import { h, uid } from '../dom.js';
import { icon } from '../icons.js';
import { screenTitle, glassPanel, goldButton, levelTile } from '../components/index.js';
import { resolveLevels, summarizeLevels } from './levels.js';
import { moveFocus, countColumns } from './keynav.js';

const pad = number => String(number).padStart(2, '0');

export function levelSelectScreen({ ids, actions, levels, progress } = {}) {
  return {
    id: ids.levelSelect, title: 'Select a level', to: [ids.mainMenu, ids.game], backdrop: 'warm',
    create(ctx) {
      const titleId = uid('mp-gs-title');
      const resolved = resolveLevels(levels, progress);   // read on every visit: progress may have changed since last time
      const summary = summarizeLevels(resolved);

      const tiles = resolved.map(level => {
        const tile = levelTile({
          number: level.number, state: level.state, stars: level.stars, name: level.name,
          thumb: level.iconName ? icon(level.iconName) : undefined,
          onClick: () => { if (!level.locked) actions.select?.(level); },
        });
        tile.dataset.level = String(level.id);
        if (level.locked) {
          const previous = resolved[level.number - 2];
          tile.addEventListener('click', () => ctx.announce(`Level ${pad(level.number)} is locked${previous ? `. Complete level ${pad(previous.number)} to unlock it.` : '.'}`));
        }
        return tile;
      });

      const grid = tiles.length
        ? h('ol', { class: 'mp-gs-levels', 'aria-label': 'Levels' }, tiles.map(tile => h('li', {}, tile)))
        : h('p', { class: 'mp-text-body mp-gs-empty' }, 'No levels are available yet.');
      const back = goldButton({ label: 'Back', tone: 'quiet', chevron: false, onClick: () => actions.back?.() });
      const el = h('section', { class: 'mp-gs-screen mp-gs-level-select', 'aria-labelledby': titleId },
        h('div', { class: 'mp-gs-stack mp-gs-stack--wide' },
          screenTitle({ text: 'Select a level', id: titleId }),
          glassPanel({ className: 'mp-gs-panel', children: [
            tiles.length > 0 && h('p', { class: 'mp-text-caption', 'data-summary': '' }, `${summary.unlocked} of ${summary.total} unlocked`, summary.stars ? ` · ${summary.stars} of ${summary.maxStars} stars` : ''),
            grid] }),
          h('div', { class: 'mp-gs-actions' }, back)));

      const firstOpen = () => tiles.find(t => t.dataset.state === 'current') ?? tiles.find(t => t.getAttribute('aria-disabled') !== 'true') ?? back;
      return {
        el, initialFocus: firstOpen,
        onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); actions.back?.(); return true; }   // same as the Back button, incl. the no-history fallback
          return tiles.length > 0 && tiles.includes(event.target) && moveFocus(event, tiles, { columns: countColumns(tiles), wrap: false });
        },
      };
    },
  };
}
