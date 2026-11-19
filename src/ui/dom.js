// Tiny DOM helpers. No dependencies, nothing touches `document` at import time.

let counter = 0;
export const uid = (prefix = 'mp') => `${prefix}-${++counter}`;
export const cx = (...names) => names.filter(Boolean).join(' ');
export const prefersReducedMotion = () =>
  !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

/** h('button', { class: 'x', onClick, 'aria-label': 'y' }, 'child', node) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.length > 2 && key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/** Parse STATIC, trusted SVG markup (icons only — never pass user text). */
export function svgFromMarkup(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}
