import { createDuelDemo } from './duelDemoEngine.js';
import { DUEL_PLAYERS } from '../src/gameplay/DuelControls.js';
import { formatClock } from '../src/gameplay/DuelRules.js';

const status = document.querySelector('#status');
const button = document.querySelector('#advance');
const round = document.querySelector('#round');
const score = document.querySelector('#score');
const timer = document.querySelector('#timer');
const players = DUEL_PLAYERS.map(player => {
  const panel = document.querySelector(`[data-player="${player.id}"]`);
  panel.querySelector('.keys').textContent = player.hints
    .map(({ keys, text }) => `${keys.join(' / ')} ${text.toLowerCase()}`).join(' · ');
  return {
    yaw: panel.querySelector('.yaw'),
    match: panel.querySelector('.match'),
    meter: panel.querySelector('meter'),
  };
});
let action = 'start';
const demo = createDuelDemo({
  duelHud: {
    setRound({ number, total, levelName }) { round.textContent = `Round ${number} of ${total} · ${levelName}`; },
    setScore([a, b]) { score.textContent = `${a} – ${b}`; },
    setMatch(...matches) {
      players.forEach(({ meter, match }, index) => {
        meter.value = matches[index];
        match.textContent = `${matches[index]}%`;
      });
    },
    setTimer(seconds) { timer.textContent = formatClock(seconds * 1000); },
    setCountdown(text) { if (text) status.textContent = text; else if (status.textContent === 'Go') status.textContent = ''; },
    setBanner(text) { if (text) status.textContent = text; },
    setSolved() {},
  },
  showDuelRound({ record, over, summary }) {
    const winner = over ? summary.winner : record.winner;
    status.textContent = winner === 'draw' ? (over ? 'Match draw' : 'Round draw')
      : `Player ${winner === 'p1' ? '1' : '2'} wins the ${over ? 'match' : 'round'}.`;
    action = over ? 'start' : 'next';
    button.textContent = over ? 'Play again' : 'Next round';
    button.disabled = false;
  },
  showError(message) { status.textContent = message; },
  onFrame(yaws) { players.forEach(({ yaw }, index) => { yaw.textContent = `${yaws[index]}°`; }); },
});

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '';
  try { await demo.advance(action); }
  catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

let last = performance.now();
function frame(now) {
  demo.frame(Math.min((now - last) / 1000, .05), now);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
