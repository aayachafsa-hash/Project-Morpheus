import { goldButton, keyCap, menuItem } from './index.js';
import { h } from './dom.js';
import { DEFAULT_ROUNDS, DUEL_ROUND_OPTIONS, DUEL_SOLVE_THRESHOLD } from '../gameplay/DuelRules.js';
import { DUEL_PLAYERS } from '../gameplay/DuelControls.js';
import { animateDuelResult, buildDuelMatchSummary, buildDuelRoundResult } from './DuelResults.js';

const title = text => h('h2', { class: 'mp-text-title' }, text);
const rows = (...items) => h('div', { class: 'mp-dialog__rows' }, items);

/** Duel dialogs: setup, pause, round results and match summary. Same dialog stack as the rest of the game. */
export function createDuelScreens({ dialogs, flow, change, leave, confirm, canvas, getDuel, isChanging }) {
  let rounds = DEFAULT_ROUNDS;
  const restartRound = () => change(async () => { await getDuel().restartRound(); flow.go('playing'); }, () => canvas.focus());
  const goTo = work => change(async () => { await work(); flow.go('playing'); }, () => canvas.focus());

  function controlsReference() {
    return h('div', { class: 'mp-duel-controls' }, DUEL_PLAYERS.map(player =>
      h('section', { class: 'mp-duel-controls__player', 'data-player': player.id },
        h('h3', { class: 'mp-text-label' }, player.name),
        h('dl', {}, player.hints.flatMap(hint => [h('dt', {}, hint.text), h('dd', {}, hint.keys.map(keyCap))])))));
  }

  function openControls() {
    const back = goldButton({ label: 'Back', onClick: () => dialogs.close('duel-controls') });
    dialogs.open('duel-controls', {
      heading: title('Duel controls'), primary: back,
      content: rows(controlsReference(), h('p', { class: 'mp-text-caption' },
        'Both players share one keyboard. If keys stop responding when many are held at once, that is the keyboard\'s own limit.'), back),
    });
  }

  function openSetup() {
    if (flow.top || flow.state !== 'mainMenu') return;
    const choices = DUEL_ROUND_OPTIONS.map(count => {
      const button = goldButton({ label: `${count} rounds`, tone: 'quiet', chevron: false, selected: count === rounds,
        onClick: () => { rounds = count; sync(); } });
      button.dataset.rounds = String(count);
      return button;
    });
    function sync() {
      for (const button of choices) {
        const on = Number(button.dataset.rounds) === rounds;
        button.setAttribute('aria-pressed', String(on));
        on ? button.setAttribute('data-selected', 'true') : button.removeAttribute('data-selected');
      }
    }
    sync();
    const start = goldButton({ label: 'Start duel', onClick: () => goTo(() => getDuel().start(rounds)) });
    const back = goldButton({ label: 'Back', tone: 'quiet', onClick: () => dialogs.close('duel-setup') });
    dialogs.open('duel-setup', {
      heading: title('Multiplayer Duel'), primary: start,
      content: rows(
        h('p', { class: 'mp-text-body' }, `Two players share one keyboard. Hold a ${Math.round(DUEL_SOLVE_THRESHOLD * 100)}% match to solve the shadow.`),
        h('div', { class: 'mp-duel-rounds', role: 'group', 'aria-label': 'Match length' }, choices),
        controlsReference(), start, back),
    });
  }

  function openPause() {
    if (flow.state !== 'playing' || isChanging()) return;
    flow.go('paused');
    const back = goldButton({ label: 'Resume', onClick: () => dialogs.close('pause') });
    dialogs.open('pause', {
      heading: title('Paused'), primary: back, menu: true,
      content: rows(back,
        menuItem({ label: 'Restart round', onClick: restartRound }),
        menuItem({ label: 'Controls', onClick: openControls }),
        menuItem({ label: 'Main Menu', onClick: () => confirm('Leave the duel?', 'The match will be lost.', 'Leave', () => leave('mainMenu')) })),
      onClose() { if (!isChanging()) flow.go('playing'); },
    });
  }

  function openResult(view) {
    const dialog = dialogs.open('results', {
      ...view, dialog: h('dialog', { class: 'mp-duel-result' }), menu: true, onDismiss() {},
    });
    if (dialog) {
      dialog.scrollTop = 0;
      animateDuelResult(dialog);
    }
  }

  function showRound(result) {
    const { over, summary, outcomes } = result;
    openResult(buildDuelRoundResult(result, () => {
      if (over) {
        dialogs.close('results');
        showSummary(summary, outcomes);
        return;
      }
      goTo(() => getDuel().nextRound());
    }, () => confirm('Leave the duel?', 'The match will be lost.', 'Leave', () => leave('mainMenu'))));
  }

  function showSummary(summary, outcomes) {
    openResult(buildDuelMatchSummary(summary, outcomes, () => goTo(() => getDuel().restartMatch()), () => leave('mainMenu')));
  }

  return { openSetup, openPause, showRound, showSummary };
}
