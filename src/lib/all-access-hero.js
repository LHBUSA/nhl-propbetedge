// PropBetEdge NHL — All Access hero (NHL presentation layer).
//
// All Access is the PRIMARY offer on every PropBetEdge sport; NHL Pro is the
// single-sport alternative. This module renders the hero card and the
// "ONLY WANT NHL?" seam that lib/pro.js places ABOVE the NHL plan cards for
// FREE readers, and the "UPGRADE TO ALL ACCESS" variant inside the member
// panel for NHL PRO ACTIVE members. It never renders for ALL ACCESS ACTIVE or
// OWNER (nothing to sell).
//
// Every commercial fact (price, promo code, checkout link, learn link) comes
// from the shared membership contract (lib/pbe-membership.js, never edited
// here). Checkout is the live Stripe Payment Link; nothing here creates or
// mutates billing state. Pure markup, no DOM, so tests render every state.
import { esc } from './dom.js';
import { ALL_ACCESS_OFFER } from './pbe-membership.js';

export const SPORTS_LINE = 'MLB · NFL · NBA · NHL · WNBA · UFC';
export const SPORTS_NEXT = 'plus every Pro sport added next.';
const NO_HERO_STATES = new Set(['all_access', 'owner']);

/** The hero renders for free readers and as an upgrade for NHL Pro members;
 *  never for All Access members or the owner. */
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
  return `<aside class="nhl-aa-hero${upgrade ? ' is-upgrade' : ''}" data-nhl-all-access="hero" data-nhl-all-access-state="${esc(state)}" aria-label="PropBetEdge All Access">
    <div class="nhl-aa-top"><span class="nhl-aa-eyebrow">PROPBETEDGE NETWORK</span><span class="nhl-aa-badge">BEST VALUE · MOST COMPLETE</span></div>
    <div class="nhl-aa-row"><h3 class="nhl-aa-title">${title}</h3><span class="nhl-aa-price" aria-label="${esc(o.price)}"><strong>${esc(amount)}</strong>/${esc(cadence)}</span></div>
    <p class="nhl-aa-tagline">${esc(o.tagline)}</p>
    <p class="nhl-aa-sports"><b>${esc(SPORTS_LINE)}</b> <span>${esc(SPORTS_NEXT)}</span></p>
    <p class="nhl-aa-promo">Launch offer: ${promo}</p>
    <div class="nhl-aa-actions">
      <a class="nhl-aa-cta" href="${esc(o.checkoutUrl)}" rel="noopener" data-pbe-placement="all_access_checkout" data-nhl-all-access-cta="checkout">GET ALL ACCESS</a>
      <a class="nhl-aa-learn" href="${esc(o.learnUrl)}" rel="noopener" data-nhl-all-access-cta="learn">WHAT'S INCLUDED</a>
    </div>
  </aside>`;
}

/** The seam between the umbrella and the single-sport alternative. */
export function dividerHtml(label = 'ONLY WANT NHL?') {
  return `<div class="nhl-aa-divider" role="separator" aria-label="${esc(label)}" data-nhl-all-access="divider"><span>${esc(label)}</span></div>`;
}
