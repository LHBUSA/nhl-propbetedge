import { $, esc, on } from '../lib/dom.js';
import { ageText } from '../lib/format.js';
import { alerts, watch } from '../services/alerts.js';

const SEVERITY_BADGE = { high: 'alert', medium: 'sched', low: 'final' };
const KIND_LABEL = { schedule: 'Schedule', goal: 'Goal', game: 'Game', goalie: 'Goalie', news: 'News' };

export function watchButton(gameId, compact = false) {
  const on_ = watch.has(gameId);
  return `<button type="button" class="watch-btn${compact ? ' watch-btn--compact' : ''}" data-watch="${esc(gameId)}" aria-pressed="${on_}"${compact ? ' aria-label="Watch this game for alerts"' : ''} title="${on_ ? 'Watching — goal, puck-drop, goalie and schedule alerts' : 'Watch for alerts'}">${watchInner(on_, compact)}</button>`;
}

// aria-pressed carries the state; the star is decorative.
function watchInner(on_, compact) {
  return `<span aria-hidden="true">${on_ ? '★' : '☆'}</span>${compact ? '' : `<span>${on_ ? 'Watching' : 'Watch'}</span>`}`;
}

function itemMarkup(a) {
  return `<li class="alert-item alert-item--${esc(a.severity)}">
    <span class="pbe-badge pbe-badge--${SEVERITY_BADGE[a.severity] || 'sched'}">${esc(KIND_LABEL[a.kind] || a.kind)}</span>
    <div class="alert-item__body">
      <a href="${esc(a.href || '#/')}"${a.external ? ' target="_blank" rel="noopener nofollow"' : ''}><b>${esc(a.title)}</b></a>
      ${a.body ? `<p>${esc(a.body)}</p>` : ''}
      <span class="micro">${esc(a.source || '')} · ${esc(ageText((Date.now() - a.at) / 1000))}</span>
    </div>
  </li>`;
}

export function bindAlertsUI() {
  const bell = $('[data-alerts]');
  const count = $('#alert-count');
  const panel = $('#alert-center');
  const list = $('#alert-list');
  const toasts = $('#toasts');

  const renderCount = n => {
    count.textContent = n > 9 ? '9+' : String(n || '');
    count.hidden = !n;
    bell.setAttribute('aria-label', n ? `Alerts: ${n} unread` : 'Alerts');
  };
  const renderList = () => {
    const items = alerts.items();
    list.innerHTML = items.length ? items.map(itemMarkup).join('')
      : `<li class="alert-empty"><b>No alerts yet.</b> Star a game to get puck-drop, goal and goalie-confirmation alerts. Postponements and breaking injury or transaction news alert for everyone.</li>`;
  };
  const toast = a => {
    const el = document.createElement('div');
    el.className = `toast toast--${a.severity}`;
    el.setAttribute('role', a.severity === 'high' ? 'alert' : 'status');
    el.innerHTML = `<span class="pbe-badge pbe-badge--${SEVERITY_BADGE[a.severity] || 'sched'}">${esc(KIND_LABEL[a.kind] || a.kind)}</span>
      <a href="${esc(a.href || '#/')}"${a.external ? ' target="_blank" rel="noopener nofollow"' : ''}>${esc(a.title)}</a>
      <button type="button" class="toast__x" aria-label="Dismiss">×</button>`;
    toasts.prepend(el);
    while (toasts.children.length > 3) toasts.lastElementChild.remove();
    const ttl = a.severity === 'high' ? 14000 : 7000;
    setTimeout(() => el.remove(), ttl);
  };

  renderCount(alerts.unread());
  const unsub = alerts.subscribe(({ fresh, unread }) => {
    renderCount(unread);
    if (!panel.hidden) renderList();
    fresh.slice(0, 3).forEach(toast);
  });

  const disposers = [
    unsub,
    on(document, 'click', '[data-alerts]', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      bell.setAttribute('aria-expanded', String(open));
      if (open) { renderList(); alerts.markRead(); }
    }),
    on(document, 'click', '[data-close-alerts]', () => { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); }),
    on(document, 'click', '.toast__x', (_, b) => b.closest('.toast')?.remove()),
    on(document, 'click', '[data-watch]', (event, b) => {
      event.preventDefault();
      const id = b.dataset.watch;
      const now = watch.toggle(id);
      for (const node of document.querySelectorAll(`[data-watch="${CSS.escape(id)}"]`)) {
        const compact = node.classList.contains('watch-btn--compact');
        node.setAttribute('aria-pressed', String(now));
        node.innerHTML = watchInner(now, compact);
      }
    })
  ];
  const onDoc = event => { if (!panel.hidden && !event.target.closest('#alert-center, [data-alerts]')) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', onDoc);
  disposers.push(() => document.removeEventListener('click', onDoc));
  return () => disposers.forEach(d => d());
}
