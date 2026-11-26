// DEMO ONLY: connects duelDemoEngine.js to the page.
import { CONFIG } from '../src/config.js';
import { createDuelDemo } from './duelDemoEngine.js';

const $ = id => document.getElementById(id);
const player = ['p1', 'p2'];
const keyName = code => code.replace('Key', '').replace('Arrow', '↔ ').replace('Digit', '');

function renderControls() {
  player.forEach((id, i) => {
    const c = CONFIG.duel.controls[id];
    $(`help${i}`).textContent =
      `${keyName(c.left)}/${keyName(c.right)} côté · ${keyName(c.forward)}/${keyName(c.back)} profondeur · ` +
      `${keyName(c.up)}/${keyName(c.down)} hauteur · ${keyName(c.rotateLeft)}/${keyName(c.rotateRight)} rotation · ` +
      `${keyName(c.cycleAxis)} axe · ${keyName(c.precision)} précision`;
  });
  document.querySelectorAll('.mark').forEach(el => { el.style.left = `${CONFIG.duel.threshold}%`; });
}

function resultText(round, match) {
  if (match.over) {
    return match.draw ? 'MATCH NUL' : `MATCH : JOUEUR ${match.matchWinner + 1} GAGNE`;
  }
  if (round.phase !== 'resolved') return '';
  const { result } = round;
  if (result.replay) return 'Round à rejouer';
  if (result.winners.length === 2) return 'Égalité : 1 point chacun';
  return `Joueur ${result.winners[0] + 1} gagne le round (+3)`;
}

function render({ round, match, scores, poses, axes, active }) {
  $('phase').textContent = { idle: 'Prêt', countdown: 'Compte à rebours', playing: 'À vous !', resolved: 'Round terminé' }[round.phase];
  $('countdown').textContent = round.phase === 'countdown' ? Math.ceil(round.remaining) : round.phase === 'playing' ? 'GO' : '';
  $('result').textContent = resultText(round, match);
  $('start').textContent = round.phase === 'idle' ? 'Démarrer (Espace)' : round.phase === 'resolved' ? 'Round suivant (Espace)' : '…';
  $('start').disabled = round.phase === 'countdown' || round.phase === 'playing';
  scores.forEach((score, i) => {
    $(`score${i}`).textContent = `${score.toFixed(0)} %`;
    $(`bar${i}`).style.width = `${Math.min(100, score)}%`;
    $(`hold${i}`).style.width = `${Math.min(100, round.holds[i] / round.holdTime * 100)}%`;
    $(`pose${i}`).textContent = `x ${poses[i].x.toFixed(2)} · h ${poses[i].y.toFixed(2)} · z ${poses[i].z.toFixed(2)} · axe ${axes[i]}${active[i] ? ' · en mouvement' : ''}`;
    $(`total${i}`).textContent = match.mode === 'classic' ? match.scores[i] : match.points[i];
    $(`record${i}`).textContent = `${match.wins[i]} V · ${match.draws[i]} N · ${match.losses[i]} D`;
  });
  $('rounds').textContent = match.mode === 'classic'
    ? `Manche ${Math.min(match.roundsPlayed + (round.phase === 'resolved' || match.over ? 0 : 1), match.roundsTotal)} / ${match.roundsTotal}`
    : `Rounds joués : ${match.roundsPlayed}`;
}

const demo = createDuelDemo({ target: window, onState: render });
renderControls();
$('start').addEventListener('click', event => { demo.startRound(); event.currentTarget.blur(); });
addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); demo.startRound(); }
});
demo.tick(0); // draw the initial state (phase "Prêt")

let last = performance.now();
function frame(now) {
  demo.tick((now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
