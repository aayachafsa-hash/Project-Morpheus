import { iconButton } from './components/index.js';
import { h } from './dom.js';

const $ = selector => document.querySelector(selector);

function tool(button, text, id) {
  const tip = h('span',{id,class:'mp-toolbar__tooltip mp-text-caption',role:'tooltip'},text);
  button.setAttribute('aria-describedby',id);
  return h('span',{class:'mp-toolbar__item'},button,tip);
}

export function createMenu() {
  const reset=iconButton({ id:'reset', iconName:'reset', label:'Reset orientation' });
  const pause=iconButton({ id:'pause', iconName:'pause', label:'Pause', pressed:false });
  const settings=iconButton({ id:'mp-settings', iconName:'gear', label:'Settings' });
  $('#reset').replaceWith(tool(reset,'Reset','mp-reset-tip'));
  $('#pause').replaceWith(tool(pause,'Pause (Esc)','pause-label'));
  $('.actions').append(tool(settings,'Settings','mp-settings-tip'));
  const caption=$('#pause-label');

  return {
    bindButtons(actions) {
      reset.addEventListener('click',actions.resetOrientation);
      pause.addEventListener('click',actions.togglePause);
      settings.addEventListener('click',actions.settings);
      $('#show-solution').addEventListener('click',actions.showSolution);
      $('#assist').addEventListener('click',actions.assist);
      $('#check')?.addEventListener('click',actions.check);
    },
    setPaused(paused) {
      if(pause.getAttribute('aria-pressed')===String(paused))return;
      pause.setPressed(paused);
      pause.setIcon(paused?'play':'pause');
      pause.setAttribute('aria-label',paused?'Resume':'Pause');
      caption.textContent=paused?'Resume (Esc)':'Pause (Esc)';
    },
  };
}
