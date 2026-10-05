// PropBetEdge NHL — All Access hero (NHL presentation layer).
//
// All Access is the PRIMARY offer on every PropBetEdge sport; NHL Pro is the
// single-sport alternative. This module renders the hero card and the
// "ONLY WANT NHL?" seam that lib/pro.js places ABOVE the NHL plan cards for
// readers without access, and the "UPGRADE TO ALL ACCESS" variant for NHL Pro
// members. It never renders for Platinum (all_access) members or the owner.
//
// The offer is the CURRENT network: 10 sports + PropBetEdge Predictions. The
// sport list and Predictions come from PBE_NETWORK (parity-tested against the
// vendored canonical family.json), never a hand-typed list. Price, promo and
// checkout come from the shared membership contract (never edited here).
// WHAT'S INCLUDED opens the local /all-access page; only GET ALL ACCESS /
// UPGRADE TO ALL ACCESS reaches Stripe. Pure markup, no DOM.
import { esc } from './dom.js';
import { ALL_ACCESS_OFFER } from './pbe-membership.js';
import { ALL_ACCESS_CHECKOUT_URL, LOCAL_ALL_ACCESS_PATH, OFFER_LINE, SECONDARY_LINE, displaySport, networkSports, predictionsProduct, sportsLine } from './account-surface.js';

export const SPORTS_LINE = sportsLine();
export const PREDICTIONS_BLURB = 'Independent, source-backed forecasts with model probability, market comparison and a scored record.';
const NO_HERO_STATES = new Set(['all_access', 'owner']);

/** The hero renders for readers without access and as an upgrade for NHL Pro
 *  members; never for Platinum (All Access) members or the owner. */
export function shouldRenderHero(m) {
  return !NO_HERO_STATES.has(String(m?.state || 'free'));
}

export function heroHtml(m) {
  if (!shouldRenderHero(m)) return '';
  const o = ALL_ACCESS_OFFER;
  const state = String(m?.state || 'free');
  const upgrade = state === 'sport_pro';
  const title = upgrade ? 'UPGRADE TO ALL ACCESS' : 'ALL ACCESS';
  const [amount, cadence] = String(o.price).split('/');
  const promo = esc(o.promoLine).replace(esc(o.promoCode), `<b class="nhl-aa-code">${esc(o.promoCode)}</b>`);
  const sports = networkSports();
  const predictions = predictionsProduct();
  return `<aside class="nhl-aa-hero${upgrade ? ' is-upgrade' : ''}" data-nhl-all-access="hero" data-nhl-all-access-state="${esc(state)}" aria-label="PropBetEdge All Access">
    <div class="nhl-aa-top"><span class="nhl-aa-eyebrow">PROPBETEDGE NETWORK</span><span class="nhl-aa-badge">BEST VALUE · MOST COMPLETE</span></div>
    <div class="nhl-aa-row"><h3 class="nhl-aa-title">${title}</h3><span class="nhl-aa-price" aria-label="${esc(o.price)}"><strong>${esc(amount)}</strong>/${esc(cadence)}</span></div>
    <p class="nhl-aa-tagline">${esc(OFFER_LINE)}.</p>
    <p class="nhl-aa-secondary">${upgrade ? 'Your NHL desk stays. Add the other nine sports and PropBetEdge Predictions to the same membership.' : esc(SECONDARY_LINE)}</p>
    <div class="nhl-aa-groups">
      <div class="nhl-aa-group"><span class="nhl-aa-group-k">SPORTS · ${sports.length}</span><ul class="nhl-aa-sports" aria-label="${esc(SPORTS_LINE)}">${sports.map(s => `<li data-sport="${esc(s.id)}"${s.id === 'nhl' ? ' class="is-here"' : ''}>${esc(displaySport(s))}${s.id === 'nhl' && upgrade ? ' <small>· yours</small>' : ''}</li>`).join('')}</ul></div>
      ${predictions ? `<div class="nhl-aa-group nhl-aa-intel"><span class="nhl-aa-group-k">INTELLIGENCE</span><b>◆ ${esc(predictions.label)}</b><small>${esc(PREDICTIONS_BLURB)}</small></div>` : ''}
    </div>
    <p class="nhl-aa-promo">Launch offer: ${promo}</p>
    <div class="nhl-aa-actions">
      <a class="nhl-aa-cta" href="${esc(ALL_ACCESS_CHECKOUT_URL)}" rel="noopener" data-pbe-placement="all_access_checkout" data-nhl-all-access-cta="checkout">${upgrade ? 'UPGRADE TO ALL ACCESS' : 'GET ALL ACCESS'}</a>
      <a class="nhl-aa-learn" href="${LOCAL_ALL_ACCESS_PATH}" data-nhl-all-access-cta="learn">WHAT'S INCLUDED</a>
    </div>
  </aside>`;
}

/** The seam between the umbrella and the single-sport alternative. */
export function dividerHtml(label = 'ONLY WANT NHL?') {
  return `<div class="nhl-aa-divider" role="separator" aria-label="${esc(label)}" data-nhl-all-access="divider"><span>${esc(label)}</span></div>`;
}
