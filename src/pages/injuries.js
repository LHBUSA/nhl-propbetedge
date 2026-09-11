export function mount(root) {
  root.innerHTML = '<section class="wrap section"><div class="pbe-empty"><h3>In build.</h3><p>This surface is being built on nhl-ufc2-production.</p></div></section>';
  return () => {};
}
