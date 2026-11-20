// Settings. Rendered from the settings store's schema, so there is no per-setting markup here.
// One definition serves two presentations: a full screen (from the main menu) and an overlay (from the pause screen).
// actions.back()  actions.close()  actions.reset()

import { h, uid } from '../dom.js';
import { screenTitle, glassPanel, goldButton } from '../components/index.js';
import { rangeControl, toggleControl, choiceControl } from './controls.js';

export function settingsScreen({ ids, actions, settings } = {}) {
  return {
    id: ids.settings, title: 'Settings', to: [ids.mainMenu], presentation: 'both', backdrop: 'warm', // main menu: the fallback when opened with no history
    create(ctx) {
      const asOverlay = ctx.presentation === 'overlay';
      const titleId = uid('mp-gs-title');
      const controls = new Map();                                   // setting key -> control element
      const sync = key => controls.get(key)?.setValue(settings.get(key));
      const apply = (key, value) => { settings.set(key, value); sync(key); };   // the store may clamp or ignore: show what is really in effect

      const build = def => {
        const common = { label: def.label, hint: def.hint, value: settings.get(def.key) };
        if (def.type === 'range') return rangeControl({ ...common, min: def.min, max: def.max, step: def.step, format: v => `${v}${def.unit ?? ''}`, onInput: v => apply(def.key, v) });
        if (def.type === 'toggle') return toggleControl({ ...common, onChange: v => apply(def.key, v) });
        return choiceControl({ ...common, options: def.options, onChange: v => apply(def.key, v) });
      };

      const groups = settings.groups.map(group => {
        const defs = settings.schema.filter(def => def.group === group.id);
        if (!defs.length) return null;
        const headingId = uid('mp-gs-group');
        defs.forEach(def => controls.set(def.key, build(def)));
        return h('section', { class: 'mp-gs-group', 'aria-labelledby': headingId },
          h('h3', { class: 'mp-text-label mp-gs-group__title', id: headingId }, group.label), defs.map(def => controls.get(def.key)));
      });

      const reset = goldButton({ label: 'Reset to defaults', tone: 'quiet', chevron: false, onClick: () => { actions.reset?.(); ctx.announce('Settings reset to defaults'); } });
      const done = goldButton({ label: asOverlay ? 'Close' : 'Back', chevron: !asOverlay, onClick: () => (asOverlay ? actions.close?.() : actions.back?.()) });

      const panel = glassPanel({
        as: 'div', className: 'mp-gs-panel mp-gs-settings', role: asOverlay ? 'dialog' : null, label: null,
        children: [screenTitle({ text: 'Settings', level: asOverlay ? 2 : 1, id: titleId }), groups, h('div', { class: 'mp-gs-actions' }, reset, done)],
      });
      if (asOverlay) { panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', titleId); }
      // As an overlay the dialog role (and its name) sit on the panel; the wrapper is then not a second named landmark.
      const el = h(asOverlay ? 'div' : 'section', { class: 'mp-gs-screen mp-gs-settings-screen', 'aria-labelledby': asOverlay ? null : titleId }, h('div', { class: 'mp-gs-stack mp-gs-stack--panel' }, panel));

      ctx.onDestroy(settings.subscribe(({ key }) => sync(key)));    // external changes (reset, another instance, the game) show up here
      return {
        el, initialFocus: '.mp-gs-range',
        // As a screen, Escape does what the Back button does (including the fallback when opened with no history).
        // As an overlay the manager's default Escape = close() is already right.
        onKey: event => { if (!asOverlay && event.key === 'Escape') { event.preventDefault(); actions.back?.(); return true; } return false; },
      };
    },
  };
}
