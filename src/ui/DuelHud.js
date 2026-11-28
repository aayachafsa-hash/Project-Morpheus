import { glassPanel, hudCard, keyHint } from './index.js';
import { h, prefersReducedMotion } from './dom.js';
import { DUEL_PLAYERS } from '../gameplay/DuelControls.js';
import { DUEL_SOLVE_THRESHOLD, formatClock } from '../gameplay/DuelRules.js';

/**
 * Split-screen overlay for Duel mode: a divider, one P1/P2 card and key hint strip per half, and a centre
 * cluster with round, score, timer and the shared target. Display only: it never computes a score.
 */
export function createDuelHud(parent) {
  const cards = {}, hints = {};
  const title = h('h2', { class: 'mp-duel__title' }, 'Morpheus Duel');
  const round = h('span', { class: 'mp-duel__round mp-text-caption' }, 'Round 1 / 5');
  const timer = h('output', { class: 'mp-duel__timer', 'aria-label': 'Time left' }, '01:30');
  const timing = h('div', { class: 'mp-duel__timing' }, timer,
    h('span', { class: 'mp-duel__threshold mp-text-caption' }, `${Math.round(DUEL_SOLVE_THRESHOLD * 100)}% to solve`));
  const score = h('output', { class: 'mp-duel__score', 'aria-label': 'Score' }, '0 – 0');
  const levelName = h('figcaption', { class: 'mp-duel__level mp-text-caption' });
  const targetCanvas = h('canvas', { role: 'img', 'aria-label': 'Target silhouette' });
  const target = h('figure', { class: 'mp-duel__target' },
    h('div', { class: 'mp-target-tile' }, targetCanvas), levelName);
  const centre = glassPanel({
    className: 'mp-duel__centre',
    children: [title, round, score, timing, target],
  });
  const countdown = h('div', { class: 'mp-duel__countdown mp-text-display', 'aria-live': 'assertive', hidden: true });
  const banner = h('div', { class: 'mp-duel__banner mp-text-title', role: 'status', hidden: true });
  const divider = h('div', { class: 'mp-duel__divider', 'aria-hidden': 'true' }, h('span', { class: 'mp-duel__sweep' }));
  // Purely visual: lets the two halves read as one wall. Sits first so every HUD element paints above it.
  const room = h('div', { class: 'mp-duel__room', 'aria-hidden': 'true' });
  const winLight = h('div', { class: 'mp-duel__win-light', 'aria-hidden': 'true' });
  const root = h('div', { class: 'mp-duel', hidden: true }, room, winLight, divider, centre, countdown, banner);
  for (const player of DUEL_PLAYERS) {
    cards[player.id] = hudCard({ player: player.id, value: 0 });
    cards[player.id].classList.add('mp-duel__card');
    hints[player.id] = h('div', { class: 'mp-duel__hints', 'data-player': player.id, 'aria-label': `${player.name} controls` },
      player.hints.map(keyHint));
    root.append(cards[player.id], hints[player.id]);
  }
  parent.append(root);

  const last = {};
  const changed = (key, value) => last[key] === value ? false : (last[key] = value, true);
  const overlay = (element, key, text) => {
    if (!changed(key, text)) return;
    element.hidden = text == null;
    if (text != null) element.textContent = text;
  };
  return {
    root,
    setVisible(visible) {
      root.hidden = !visible;
      if (!visible) {
        delete root.dataset.winner;
        Object.keys(last).forEach(key => delete last[key]);
      }
    },
    setRound({ number, total, levelName: name, image }) {
      round.textContent = `Round ${number} / ${total}`;
      levelName.textContent = name;
      targetCanvas.width = image.width; targetCanvas.height = image.height;
      targetCanvas.getContext('2d').drawImage(image, 0, 0);
    },
    setScore([a, b]) {
      const text = `${a} – ${b}`;
      if (score.textContent === text) return;
      score.textContent = text;
      if (!prefersReducedMotion()) score.animate?.([
        { opacity: .72, transform: 'translateY(.12em)' }, { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 250, easing: 'ease-out' });
    },
    setWinner(winner) {
      if (winner === 'p1' || winner === 'p2') root.dataset.winner = winner;
      else delete root.dataset.winner;
    },
    setMatch(p1, p2) {
      if (changed('p1', p1)) cards.p1.update(p1);
      if (changed('p2', p2)) cards.p2.update(p2);
    },
    setSolved(p1, p2) {
      if (changed('s1', p1)) cards.p1.dataset.solved = String(p1);
      if (changed('s2', p2)) cards.p2.dataset.solved = String(p2);
    },
    setTimer(seconds) {
      if (!changed('timer', seconds)) return;
      timer.textContent = formatClock(seconds * 1000);
      timer.dataset.low = String(seconds <= 10);
    },
    setCountdown(text) { overlay(countdown, 'countdown', text); },
    setBanner(text) {
      if (text != null) overlay(countdown, 'countdown', null);
      overlay(banner, 'banner', text);
    },
  };
}
