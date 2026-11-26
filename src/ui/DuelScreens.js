import { goldButton, keyCap, laurelTitle, menuItem } from './index.js';
import { h } from './dom.js';
import { DEFAULT_ROUNDS, DUEL_ROUND_OPTIONS, formatClock, formatSeconds } from '../gameplay/DuelRules.js';
import { DUEL_PLAYERS } from '../gameplay/DuelControls.js';

const title = text => h('h2', { class: 'mp-text-title' }, text);
const rows = (...items) => h('div', { class: 'mp-dialog__rows' }, items);
const nameOf = id => id === 'p1' ? 'Player 1' : 'Player 2';

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
      const button = goldButton({ label: `Best of ${count}`, tone: 'quiet', chevron: false, selected: count === rounds,
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
        h('p', { class: 'mp-text-body' }, 'Two players, one keyboard. The screen splits in two and both race to cast the same shadow first.'),
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

  const table = (head, body) => h('table', { class: 'mp-duel-table' },
    h('thead', {}, h('tr', {}, head.map(cell => h('th', { scope: 'col' }, cell)))),
    h('tbody', {}, body));

  function showRound({ record, score, number, total, over, summary }) {
    const draw = record.winner === 'draw';
    const reason = draw
      ? (record.timedOut ? 'Time is up and the shadows match equally.' : 'Both players solved the puzzle at the same time.')
      : (record.timedOut ? 'Time is up. The closer shadow takes the round.' : 'First to cast the shadow takes the round.');
    const line = id => h('tr', { 'data-player': id, 'data-winner': String(record.winner === id) },
      h('th', { scope: 'row' }, id.toUpperCase()),
      h('td', {}, record[id].solvedMs != null ? '✓' : '—'),
      h('td', {}, formatSeconds(record[id].solvedMs)),
      h('td', {}, `${Math.round(record[id].best)}%`),
      h('td', {}, record.winner === id ? '+1' : '0'));
    const next = goldButton({
      label: over ? 'Match summary' : 'Next round',
      onClick: () => {
        if (over) { dialogs.close('results'); showSummary(summary); return; }
        goTo(() => getDuel().nextRound());
      },
    });
    dialogs.open('results', {
      heading: laurelTitle({ text: draw ? 'Draw' : `${nameOf(record.winner)} wins the round`, level: 2, tone: draw ? 'neutral' : 'gold' }),
      primary: next, menu: true, onDismiss() {},
      content: rows(
        h('p', { class: 'mp-text-body' }, `Round ${number} of ${total} · ${record.level}`),
        h('p', { class: 'mp-text-caption' }, reason),
        table(['', 'Solved', 'Time', 'Match', 'Point'], [line('p1'), line('p2')]),
        h('p', { class: 'mp-duel-scoreline', 'aria-label': 'Score' }, `P1 ${score[0]} – ${score[1]} P2`),
        next,
        menuItem({ label: 'Main Menu', onClick: () => confirm('Leave the duel?', 'The match will be lost.', 'Leave', () => leave('mainMenu')) })),
    });
  }

  function showSummary(summary) {
    const draw = summary.winner === 'draw';
    const row = (label, a, b) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, a), h('td', {}, b));
    const again = goldButton({ label: 'Play again', onClick: () => goTo(() => getDuel().restartMatch()) });
    dialogs.open('results', {
      heading: laurelTitle({ text: draw ? 'Draw' : `${nameOf(summary.winner)} wins`, level: 2, tone: draw ? 'neutral' : 'gold' }),
      primary: again, menu: true, onDismiss() {},
      content: rows(
        h('p', { class: 'mp-text-body' }, `Match summary · ${summary.mode}`),
        h('p', { class: 'mp-duel-scoreline mp-duel-scoreline--big', 'aria-label': 'Final score' }, `${summary.score[0]} – ${summary.score[1]}`),
        table(['', 'P1', 'P2'], [
          row('Average match', `${summary.averageMatch.p1}%`, `${summary.averageMatch.p2}%`),
          row('Best time', formatClock(summary.bestTimeMs.p1), formatClock(summary.bestTimeMs.p2)),
          row('Rounds won', String(summary.roundsWon.p1), String(summary.roundsWon.p2)),
        ]),
        again,
        menuItem({ label: 'Main Menu', onClick: () => leave('mainMenu') })),
    });
  }

  return { openSetup, openPause, showRound, showSummary };
}
