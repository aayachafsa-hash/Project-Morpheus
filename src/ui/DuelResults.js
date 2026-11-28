import { goldButton, icon, keyCap } from './index.js';
import { h, prefersReducedMotion } from './dom.js';
import { DUEL_POINTS, formatClock, formatSeconds, roundPoints } from '../gameplay/DuelRules.js';

const players = ['p1', 'p2'];
const playerName = id => id === 'p1' ? 'Player 1' : 'Player 2';

function roundReason(record) {
  const { winner, timedOut } = record;
  if (winner === 'draw') {
    return timedOut ? 'Time expired · Both players had the same match.' : 'Both players solved at the same time.';
  }
  const other = winner === 'p1' ? 'p2' : 'p1';
  if (timedOut) return `Time expired · ${record[winner].best}% to ${record[other].best}% match.`;
  const finish = record[other].solvedMs == null
    ? `${other.toUpperCase()} didn’t finish.` : `${other.toUpperCase()} finished in ${formatSeconds(record[other].solvedMs)}.`;
  return `Solved in ${formatSeconds(record[winner].solvedMs)} · ${finish}`;
}

function statisticsTable(label, columns, lines) {
  return h('table', { class: 'mp-duel-table mp-duel-result__table', 'aria-label': label },
    h('thead', {}, h('tr', {}, columns.map(column => h('th', { scope: 'col' }, column)))),
    h('tbody', {}, lines));
}

function matchCell(percent, better) {
  return h('td', { 'data-better': better, 'aria-label': `${percent}%` },
    h('span', { 'aria-hidden': 'true', 'data-match-percent': percent }, `${percent}%`),
    h('div', { class: 'mp-duel-result__bar', 'aria-hidden': 'true' },
      h('span', { style: { width: `${percent}%` } })));
}

function roundTable(record) {
  const cols = ['Player', 'Solved', 'Time', 'Match', 'Points'];
  const lines = players.map(id => {
    const other = id === 'p1' ? 'p2' : 'p1';
    const { solvedMs, best } = record[id];
    const opponent = record[other];
    const points = roundPoints(record.winner, id);
    const solved = solvedMs != null;
    return h('tr', { 'data-player': id, 'data-winner': String(record.winner === id) },
      h('th', { scope: 'row' }, id.toUpperCase()),
      h('td', { 'data-better': solved && opponent.solvedMs == null, 'data-missing': !solved,
        'aria-label': solved ? 'Solved' : 'Unsolved' }, solved ? '✓' : '—'),
      h('td', { 'data-better': solved && (opponent.solvedMs == null || solvedMs < opponent.solvedMs),
        'data-missing': !solved }, formatSeconds(solvedMs)),
      matchCell(Math.round(best), best > opponent.best),
      h('td', { 'data-better': points > roundPoints(record.winner, other) },
        h('span', { 'data-win-points': points === DUEL_POINTS.win }, points ? `+${points}` : '0')));
  });
  return statisticsTable('Round statistics', cols, lines);
}

function resultHeading({ winner, eyebrow, headline, verdict, reason }) {
  return h('div', { class: 'mp-duel-result__heading', 'data-player': winner },
    h('p', { class: 'mp-duel-result__eyebrow mp-text-caption' }, eyebrow),
    h('div', { class: 'mp-duel-result__award' },
      icon('laurel'),
      h('h2', {}, h('span', { class: 'mp-duel-result__headline' }, headline),
        verdict && h('span', { class: 'mp-duel-result__verdict mp-text-caption' }, verdict)),
      icon('laurel')),
    reason && h('p', { class: 'mp-duel-result__reason mp-text-body' }, reason));
}

function resultView({ heading, score, scoreLabel, outcomes, table, actionLabel, onAction, onMenu }) {
  const next = goldButton({ label: actionLabel, chevron: false, onClick: onAction });
  next.classList.add('mp-duel-result__next');
  const enter = keyCap('Enter');
  enter.setAttribute('aria-hidden', 'true');
  next.append(enter);
  const menu = goldButton({ label: 'Main menu', tone: 'quiet', chevron: false, onClick: onMenu });
  menu.classList.add('mp-duel-result__menu');

  const pips = outcomes.map((outcome, index) => {
    const label = outcome === 'draw' ? 'draw' : outcome ? `${outcome.toUpperCase()} won` : 'upcoming';
    return h('li', { 'data-outcome': outcome, 'aria-label': `Round ${index + 1}: ${label}` });
  });
  const scoreGroup = h('div', { class: 'mp-duel-result__score-group' },
    h('div', { class: 'mp-duel-result__score', role: 'group', 'aria-label': scoreLabel },
      h('span', { 'data-player': 'p1' }, h('span', { class: 'mp-text-caption' }, 'P1'), h('strong', {}, score[0])),
      h('span', { 'aria-hidden': 'true' }, '–'),
      h('span', { 'data-player': 'p2' }, h('span', { class: 'mp-text-caption' }, 'P2'), h('strong', {}, score[1]))),
    pips.length > 0 && h('ol', { class: 'mp-duel-result__pips', 'aria-label': 'Round outcomes' }, pips));
  const content = h('div', { class: 'mp-duel-result__content' }, scoreGroup, table,
    h('div', { class: 'mp-duel-result__buttons' }, next, menu));
  return { heading, primary: next, content };
}

export function buildDuelRoundResult({ record, score, number, total, over, outcomes }, onNext, onMenu) {
  const draw = record.winner === 'draw';
  const winner = draw ? null : record.winner;
  const heading = resultHeading({
    winner, eyebrow: `Round ${number} of ${total} · ${record.level}`,
    headline: over ? 'Final round' : draw ? 'Draw' : playerName(winner),
    verdict: over ? (draw ? 'Draw' : `${playerName(winner)} wins the round`) : draw ? null : 'Wins the round',
    reason: roundReason(record),
  });
  const roundOutcomes = Array.from({ length: total }, (_, index) =>
    outcomes?.[index] ?? (index === number - 1 ? record.winner : null));
  return resultView({ heading, score, scoreLabel: 'Running score', outcomes: roundOutcomes, table: roundTable(record),
    actionLabel: over ? 'See final result' : 'Next round', onAction: onNext, onMenu });
}

export function buildDuelMatchSummary(summary, outcomes, onAgain, onMenu) {
  const winner = summary.winner === 'draw' ? null : summary.winner;
  const heading = resultHeading({
    winner, eyebrow: `Match summary · ${summary.mode}`,
    headline: winner ? playerName(winner) : 'Draw', verdict: winner ? 'Wins the match' : null,
  });
  const { score, averageMatch, bestTimeMs, roundsWon } = summary;
  const lines = players.map(id => {
    const other = id === 'p1' ? 'p2' : 'p1';
    const time = bestTimeMs[id];
    const otherTime = bestTimeMs[other];
    return h('tr', { 'data-player': id, 'data-winner': String(winner === id) },
      h('th', { scope: 'row' }, id.toUpperCase()),
      matchCell(averageMatch[id], averageMatch[id] > averageMatch[other]),
      h('td', { 'data-better': time != null && (otherTime == null || time < otherTime),
        'data-missing': time == null }, formatClock(time)),
      h('td', { 'data-better': roundsWon[id] > roundsWon[other] }, roundsWon[id]));
  });
  const table = statisticsTable('Match statistics', ['Player', 'Average match', 'Best time', 'Rounds won'], lines);
  return resultView({ heading, score, scoreLabel: 'Final score', outcomes: outcomes ?? [], table,
    actionLabel: 'Play again', onAction: onAgain, onMenu });
}

export function animateDuelResult(dialog) {
  if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return;
  const counters = [...dialog.querySelectorAll('[data-match-percent]')];
  for (const counter of counters) counter.textContent = '0%';
  const start = performance.now();
  const tick = now => {
    if (!dialog.open) return;
    if (prefersReducedMotion()) {
      for (const counter of counters) counter.textContent = `${counter.dataset.matchPercent}%`;
      return;
    }
    const progress = Math.max(0, Math.min(1, (now - start - 180) / 740));
    const amount = 1 - (1 - progress) ** 3;
    for (const counter of counters) counter.textContent = `${Math.round(counter.dataset.matchPercent * amount)}%`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
