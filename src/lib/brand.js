// Customer-facing source labels (PropBetEdge network standard: "DATA · PropSports").
// Data supplied by an upstream collection lane is attributed to PropSports on customer surfaces;
// upstream lineage stays in the API provenance envelope, captures and admin/debug.
// Named publishers of linked reporting (e.g. NHL.com's projected-lineup article) pass through unchanged.
export const DATA_BRAND = 'PropSports';
export const DATA_LINE = 'DATA · PropSports';
const LANE = /^(?:NHL(?: Edge| API| Stats API)?|api-web\.nhle\.com|api\.nhle\.com)(?=$|\s)/i;
export function customerSource(label) {
  if (label == null || label === '') return label;
  const s = String(label).trim();
  if (/^NHL\.com\b/i.test(s)) return s;                       // named publisher (linked reporting)
  return s.replace(LANE, m => DATA_BRAND).replace(/^PropSports (?!·)/, 'PropSports · ');
}
// A source link is shown only when it is a human-readable publisher page, never an API/infrastructure endpoint.
export function publisherUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (/(^|\.)(api-web|api|statsapi)[.-]|\.api\.|(^|\.)api\./i.test(u.hostname) || /\/v\d+\//.test(u.pathname)) return null;
  return u.href;
}
