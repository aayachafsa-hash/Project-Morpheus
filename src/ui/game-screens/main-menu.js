// Main menu: title, Play, Settings. Only the destinations this prototype has (no Credits, Store, Modes...).
// actions.play(), actions.settings()

import { h, uid } from '../dom.js';
import { menuItem } from '../components/index.js';
import { moveFocus } from './keynav.js';

export function mainMenuScreen({ ids, actions, tagline = 'A shadow puzzle' } = {}) {
  return {
    id: ids.mainMenu, title: 'Main menu', to: [ids.levelSelect, ids.settings], escape: false, backdrop: 'warm',
    create() {
      const titleId = uid('mp-gs-title');
      const items = [
        menuItem({ label: 'Play', description: 'Choose a level', onClick: () => actions.play?.() }),
        menuItem({ label: 'Settings', description: 'Audio, display and controls', onClick: () => actions.settings?.() }),
      ];
      const el = h('section', { class: 'mp-gs-screen mp-gs-main-menu', 'aria-labelledby': titleId },
        h('div', { class: 'mp-gs-stack mp-gs-stack--start' },
          h('div', { class: 'mp-gs-brand' }, h('h1', { class: 'mp-text-display mp-gs-hero', id: titleId }, 'Morpheus'), h('p', { class: 'mp-text-caption' }, tagline)),
          h('nav', { class: 'mp-gs-menu', 'aria-label': 'Main menu' }, items)));
      return { el, initialFocus: '.mp-menu-item', onKey: event => moveFocus(event, items) };
    },
  };
}
