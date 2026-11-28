import { h } from './dom.js';
import { menuBehaviour } from './hoverFocus.js';

export function createDialogManager(flow, background) {
  const stack = [];
  // per dialog element: do ArrowUp/Down walk its rows, and which row is its default? (reusable dialogs are opened more than once)
  const menus = new WeakMap();
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
      dialog.classList.toggle('mp-dialog--menu', menu); // reusable dialogs are opened more than once
      dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('role','dialog');
      heading.id ||= 'mp-dialog-title-' + id;
      dialog.setAttribute('aria-labelledby',heading.id);
      dialog.replaceChildren(h('div',{class:'mp-panel mp-dialog__panel'}, heading, content));
      if (!dialog.isConnected) document.body.append(dialog);
      stack.push({id,dialog,opener,onClose,onDismiss});
      dialog.showModal();
      sync();
      const home = primary ?? dialog.querySelector('button, a, input');
      home?.focus();
      dialog.oncancel = event => { event.preventDefault(); close(id, true); };
      if (!menus.has(dialog)) menuBehaviour(dialog, { arrows: () => menus.get(dialog).arrows, home: () => menus.get(dialog).home });
      menus.set(dialog, { arrows: menu, home });
      if (!dialog.dataset.mpReusable) dialog.addEventListener('close',()=>{
        Promise.allSettled(dialog.getAnimations().map(animation=>animation.finished)).then(()=>dialog.remove());
      },{once:true});
      return dialog;
    },
    close,
    closeAll() { while (stack.length) close(stack.at(-1).id); },
  };
}
