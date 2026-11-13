const $ = selector => document.querySelector(selector);

export function createMenu() {

  function bindButtons(actions) {
    $('#reset').addEventListener('click', actions.reset);
    $('#show-solution').addEventListener('click', actions.showSolution);
    $('#pause').addEventListener('click', actions.togglePause);
    $('#check').addEventListener('click', actions.check);
  }

  return {
    bindButtons,
    setPaused(paused) {
      $('#pause').setAttribute('aria-pressed', String(paused));
      $('#pause-label').textContent = paused ? 'Resume' : 'Pause';
    },
  };
}
