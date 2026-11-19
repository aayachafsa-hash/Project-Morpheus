// Focus helpers. Nothing here knows about screens; it works on any container element.

const CANDIDATES = 'a[href],button,input,select,textarea,[tabindex]';

const isTabbable = el => !el.disabled && el.tabIndex >= 0 && el.type !== 'hidden' && !el.closest('[hidden],[inert]');
export const focusables = root => [...root.querySelectorAll(CANDIDATES)].filter(isTabbable);

export function focusSafely(el) {
  if (!el || typeof el.focus !== 'function') return false;
  el.focus({ preventScroll: true });
  return el.ownerDocument.activeElement === el;
}

/** spec: CSS selector | element | () => element. Falls back to the first tabbable, then to the container itself. */
export function focusInitial(container, spec) {
  let target = null;
  try {
    target = typeof spec === 'function' ? spec(container) : typeof spec === 'string' ? container.querySelector(spec) : spec;
  } catch { target = null; }
  if (target && container.contains(target) && focusSafely(target)) return target;
  const first = focusables(container)[0];
  if (first && focusSafely(first)) return first;
  return focusSafely(container) ? container : null;
}

/** Keep Tab / Shift+Tab inside `container`. Returns true when it handled (and prevented) the event. */
export function trapTab(container, event) {
  const list = focusables(container);
  const active = container.ownerDocument.activeElement;
  if (!list.length) { event.preventDefault(); focusSafely(container); return true; }
  const first = list[0], last = list[list.length - 1];
  const outside = !container.contains(active);
  if (outside || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault();
    focusSafely(event.shiftKey ? last : first);
    return true;
  }
  return false;
}
