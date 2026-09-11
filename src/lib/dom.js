// Source text is untrusted. Everything interpolated into markup goes through esc().
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
export const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setHTML(node, markup) {
  if (node) node.innerHTML = markup;
  return node;
}

// Delegated listener that is removed by the returned disposer.
export function on(root, type, selector, handler, options) {
  const listener = event => {
    const target = event.target.closest?.(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
