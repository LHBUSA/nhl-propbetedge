// One alert bus for the whole app. Stable keys, one seen-set (MLB fired the
// same HR twice from two watchers with separate lists). Recent alerts and
// seen keys persist per viewer for 36 h; storage failures degrade to memory.
const STORE = 'pbe.nhl.alerts.v1';
const TTL_MS = 36 * 3600 * 1000;
const MAX = 40;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw) return { seen: {}, items: [], readAt: 0 };
    const now = Date.now();
    const seen = Object.fromEntries(Object.entries(raw.seen || {}).filter(([, t]) => now - t < TTL_MS));
    return { seen, items: (raw.items || []).filter(i => now - i.at < TTL_MS).slice(0, MAX), readAt: raw.readAt || 0 };
  } catch {
    return { seen: {}, items: [], readAt: 0 };
  }
}

const state = load();
const listeners = new Set();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* memory only */ } };

export const alerts = {
  prime(keys = []) {
    const now = Date.now();
    let changed = false;
    for (const k of keys) if (!state.seen[k]) { state.seen[k] = now; changed = true; }
    if (changed) save();
  },
  emit(list = []) {
    const fresh = [];
    const now = Date.now();
    for (const a of list) {
      if (!a?.key || state.seen[a.key]) continue;
      state.seen[a.key] = now;
      const item = { ...a, at: now };
      state.items.unshift(item);
      fresh.push(item);
    }
    if (!fresh.length) return;
    state.items = state.items.slice(0, MAX);
    save();
    listeners.forEach(fn => fn({ fresh, items: state.items, unread: this.unread() }));
  },
  apply(result) {
    if (!result) return;
    this.prime(result.prime);
    this.emit(result.alerts);
  },
  items() { return state.items; },
  unread() { return state.items.filter(i => i.at > state.readAt).length; },
  markRead() {
    state.readAt = Date.now();
    save();
    listeners.forEach(fn => fn({ fresh: [], items: state.items, unread: 0 }));
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};

// Watched games: per-viewer convenience (localStorage), drives which games
// produce low/medium alerts. Schedule disruptions alert regardless.
const WATCH = 'pbe.nhl.watch.v1';
const watchListeners = new Set();
function readWatch() {
  try { return new Set(JSON.parse(localStorage.getItem(WATCH) || '[]').map(String)); } catch { return new Set(); }
}
let watchSet = readWatch();
export const watch = {
  has: id => watchSet.has(String(id)),
  ids: () => new Set(watchSet),
  toggle(id) {
    const k = String(id);
    if (watchSet.has(k)) watchSet.delete(k); else watchSet.add(k);
    try { localStorage.setItem(WATCH, JSON.stringify([...watchSet].slice(-50))); } catch { /* memory only */ }
    watchListeners.forEach(fn => fn(watchSet));
    return watchSet.has(k);
  },
  subscribe(fn) { watchListeners.add(fn); return () => watchListeners.delete(fn); }
};
