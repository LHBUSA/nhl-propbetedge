const ET = 'America/New_York';

const fmtCache = new Map();
function fmt(key, options) {
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-US', options));
  return fmtCache.get(key);
}

const valid = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function todayET(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function timeET(iso) {
  const d = valid(iso);
  return d ? `${fmt('tET', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(d)} ET` : 'TBD';
}

export function clockET(iso) {
  const d = valid(iso);
  return d ? `${fmt('cET', { timeZone: ET, hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(d)} ET` : '—';
}

export function dayET(iso, withYear = false) {
  const d = valid(iso);
  if (!d) return '';
  return fmt(withYear ? 'dETy' : 'dET', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(d);
}

export function dateLabel(ymd, opts = {}) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00Z`);
  return fmt(`dl${opts.long ? 'L' : ''}`, { timeZone: 'UTC', weekday: opts.long ? 'long' : 'short', month: opts.long ? 'long' : 'short', day: 'numeric' }).format(d);
}

export function ageText(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function countdownParts(targetIso, now = Date.now()) {
  const d = valid(targetIso);
  if (!d) return null;
  const ms = d.getTime() - now;
  if (ms <= 0) return { done: true, days: 0, hours: 0, mins: 0, secs: 0 };
  return {
    done: false,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
    secs: Math.floor((ms % 60000) / 1000)
  };
}

export function daysUntil(ymd, fromYmd = todayET()) {
  if (!ymd) return null;
  return Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86400000);
}

export const n = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

export function num(value, digits = 0) {
  const v = n(value);
  return v === null ? '—' : v.toFixed(digits);
}

export function pct(value, digits = 1) {
  const v = n(value);
  return v === null ? '—' : `${(v * 100).toFixed(digits)}%`;
}

// NHL save percentage convention: .915
export function svPct(value) {
  const v = n(value);
  return v === null ? '—' : v.toFixed(3).replace(/^0/, '');
}

export function share(a, b) {
  const x = n(a); const y = n(b);
  if (x === null || y === null || x + y === 0) return null;
  return x / (x + y);
}

export function gameTypeLabel(type) {
  return { 1: 'Preseason', 2: 'Regular season', 3: 'Playoffs', 4: 'All-Star' }[Number(type)] || '';
}

export function periodLabel(period, periodType) {
  if (periodType === 'SO') return 'SO';
  if (periodType === 'OT') return Number(period) > 4 ? `${Number(period) - 3}OT` : 'OT';
  const p = Number(period);
  return p ? ['', '1st', '2nd', '3rd'][p] || `P${p}` : '';
}

// Mirrors backend parseSituation: away goalie, away skaters, home skaters, home goalie.
export function parseSituationClient(code) {
  const v = String(code ?? '');
  if (!/^\d{4}$/.test(v)) return null;
  return { code: v, away_goalie_in_net: v[0] === '1', away_skaters: Number(v[1]), home_skaters: Number(v[2]), home_goalie_in_net: v[3] === '1' };
}

export const titleCase =s => String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
