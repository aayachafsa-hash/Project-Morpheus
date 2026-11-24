import { h } from './dom.js';

export function createDialogManager(flow, background) {
  const stack = [];
  const sync = () => {
    for (const el of background) {
      el.inert = Boolean(stack.length);
      if (stack.length) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
    stack.forEach(({ dialog }, i) => {
      const covered = i !== stack.length - 1;
      dialog.inert = covered;
      if (covered) dialog.setAttribute('aria-hidden', 'true');
      else dialog.removeAttribute('aria-hidden');
    });
    document.body.classList.toggle('mp-dialog-open', Boolean(stack.length));
  };

  function close(id, dismiss = false) {
    const entry = stack.at(-1);
    if (!entry || entry.id !== id) return;
    if (dismiss && entry.onDismiss) { entry.onDismiss(); return; }
    stack.pop();
    entry.dialog.close();
    sync();
    flow.close(id);
    entry.onClose?.();
    if (entry.opener?.isConnected && !entry.opener.closest('[inert], [hidden]')) entry.opener.focus();
  }

  return {
    open(id, { heading, content, primary, onClose, onDismiss, menu = false, dialog = h('dialog') }) {
      if (!flow.open(id)) return;
      const opener = document.activeElement;
      dialog.classList.add('mp-dialog');
      dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('role','dialog');
      heading.id ||= 'mp-dialog-title-' + id;
      dialog.setAttribute('aria-labelledby',heading.id);
      dialog.replaceChildren(h('div',{class:'mp-panel mp-dialog__panel'}, heading, content));
      if (!dialog.isConnected) document.body.append(dialog);
      stack.push({id,dialog,opener,onClose,onDismiss});
      dialog.showModal();
      sync();
      (primary ?? dialog.querySelector('button, a, input'))?.focus();
      dialog.oncancel = event => { event.preventDefault(); close(id, true); };
      dialog.onkeydown = event => {
        if (!menu || !['ArrowUp','ArrowDown'].includes(event.key)) return;
        const items = [...dialog.querySelectorAll('button:not(:disabled):not([aria-disabled="true"])')];
        if (!items.includes(document.activeElement)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        items[(items.indexOf(document.activeElement) + offset + items.length) % items.length]?.focus();
      };
      if (!dialog.dataset.mpReusable) dialog.addEventListener('close',()=>{
        Promise.allSettled(dialog.getAnimations().map(animation=>animation.finished)).then(()=>dialog.remove());
      },{once:true});
      return dialog;
    },
    close,
    closeAll() { while (stack.length) close(stack.at(-1).id); },
  };
}
