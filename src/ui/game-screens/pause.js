// Pause: an overlay over the (key-passthrough) gameplay screen. Resume, Restart, Settings, Main menu.
// Escape = Resume. This screen handles that key itself so Resume has exactly one code path.
// actions.resume()  actions.restart()  actions.settings()  actions.mainMenu()
// Pausing the game while this is open is the integration layer's job (it calls ui.open(ids.pause) and onResume/onRestart).

import { h, uid } from '../dom.js';
import { menuItem } from '../components/index.js';
import { moveFocus } from './keynav.js';

export function pauseScreen({ ids, actions } = {}) {
  return {
    id: ids.pause, title: 'Paused', to: [ids.settings, ids.mainMenu], presentation: 'overlay', transitionMs: 250,
    create(ctx) {
      const titleId = uid('mp-gs-title');
      const items = [
        menuItem({ label: 'Resume', onClick: () => actions.resume?.() }),
        menuItem({ label: 'Restart', description: 'Start this puzzle again', onClick: () => actions.restart?.() }),
        menuItem({ label: 'Settings', onClick: () => actions.settings?.() }),
        menuItem({ label: 'Main menu', onClick: () => actions.mainMenu?.() }),
      ];
      const levelName = typeof ctx.params?.levelName === 'string' ? ctx.params.levelName : '';
      const el = h('section', { class: 'mp-gs-screen mp-gs-pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('div', { class: 'mp-gs-stack mp-gs-stack--center mp-gs-stack--narrow' },
          h('div', { class: 'mp-gs-brand' }, h('h2', { class: 'mp-text-display', id: titleId }, 'Paused'), levelName && h('p', { class: 'mp-text-caption' }, levelName)),
          h('nav', { class: 'mp-gs-menu', 'aria-label': 'Pause menu' }, items)));
      return {
        el, initialFocus: '.mp-menu-item',
        onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); actions.resume?.(); return true; }
          return moveFocus(event, items);
        },
      };
    },
  };
}
