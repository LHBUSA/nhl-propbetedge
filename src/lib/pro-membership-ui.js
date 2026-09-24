// NHL Pro membership UI — pure markup over the shared PropBetEdge membership
// contract (lib/pbe-membership.js, byte-identical to propbetedge-workers
// shared/membership). No DOM, no CSS import, so tests can render every state.
//
// The membership object comes from nhl-gateway GET /auth/session, which
// derives it from the billing verdict (entitled + access_source). Nothing here
// decides access: an account that the gateway did not mark `pro` is FREE, and a
// FREE object never unlocks anything (readMembership never widens).
import { esc } from './dom.js';
import {
  ALL_ACCESS_OFFER, ALL_ACCESS_URL, MANAGE_URL,
  accountPanelHtml, membershipBadgeHtml, planText, readMembership
} from './pbe-membership.js';
import { dividerHtml, heroHtml } from './all-access-hero.js';

export const SPORT = 'nhl';

// lib/account.js state -> membership. A `pro` session from a gateway build
// that predates the contract carries no membership object; it is shown as the
// sport's own plan (the gateway already decided `pro`), never as All Access.
export function accountMembership(account) {
  if (account?.state !== 'pro') return readMembership(null, SPORT);
  if (account.membership) return readMembership(account.membership, SPORT);
  return readMembership({
    state: 'sport_pro', entitled: true, access_source: 'sport',
    email: account.email || null, plan: account.subscription?.plan || null,
    current_period_end: account.subscription?.current_period_end || null,
    cancel_at_period_end: Boolean(account.subscription?.cancel_at_period_end)
  }, SPORT);
}

export const isMember = account => account?.state === 'pro';

// Header control. Members get the compact membership badge (NHL PRO ACTIVE /
// ALL ACCESS ACTIVE / OWNER); free AND unresolved sessions get the same neutral
// "NHL PRO" markup, so the control never flickers while the gateway answers.
export function proButtonHtml(account) {
  const m = accountMembership(account);
  return m.entitled ? membershipBadgeHtml(m) : '<span>NHL</span> PRO';
}

export function proButtonLabel(account, authReady = false) {
  const m = accountMembership(account);
  if (m.entitled) return `${m.label} — account and subscription`;
  return authReady ? 'Sign in to NHL Pro or see NHL Pro pricing' : 'See what NHL Pro includes';
}

// "Renews Oct 24, 2026" / "Ends Oct 24, 2026" from the browser-safe object.
export function renewalText(m) {
  if (!m?.entitled || !m.current_period_end) return '';
  const date = new Date(m.current_period_end);
  if (Number.isNaN(date.getTime())) return '';
  const end = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return m.cancel_at_period_end ? `Ends ${end}` : `Renews ${end}`;
}

// The NHL plan cards. The plan facts (price, cadence, Stripe link) live in
// lib/pro.js (NHL_PRO_PLANS) and are rendered here unchanged.
export function planCardsHtml(plans) {
  return Object.entries(plans).map(([key, plan]) => `
    <button type="button" class="pbepro__plan" data-pro-plan="${esc(key)}" role="radio" aria-checked="false">
      <div class="pbepro__plan-top"><span>${esc(plan.label)}</span><b>${esc(plan.badge)}</b></div>
      <div class="pbepro__price"><strong>${esc(plan.price)}</strong><span>${esc(plan.cadence)}</span></div>
      <small>${esc(plan.detail)}</small>
      <div class="pbepro__select">Choose ${esc(plan.label.toLowerCase())}</div>
    </button>`).join('');
}

// ABOVE the NHL cards for FREE readers only: the All Access hero (the primary
// offer, whose checkout is live even while NHL checkout is closed) followed by
// the "ONLY WANT NHL?" seam. Empty for every member.
export function freeOfferHtml(m) {
  return m?.state === 'free' ? `${heroHtml(m)}${dividerHtml()}` : '';
}

// The member panel inside the NHL Pro surface: shared badge + email + plan line
// + manage link + network row, then the renewal date, then (sport_pro only)
// the UPGRADE TO ALL ACCESS hero. all_access / owner get no purchase CTA at all.
export function memberPanelHtml(m) {
  if (!m?.entitled) return '';
  const renewal = renewalText(m);
  return `${accountPanelHtml(m, { sport: SPORT })}
    ${renewal ? `<p class="pbepro__renewal">${esc(renewal)}</p>` : ''}
    ${m.show_all_access_upgrade ? heroHtml(m) : ''}
    <button type="button" class="pbepro__signout" data-pro-signout>Sign out</button>`;
}

// PBE Picks Pro block heading for members, from the label.
export function picksProHeading(m) {
  if (m?.state === 'owner') return 'Owner access is active on this account';
  if (m?.state === 'all_access') return 'All Access is active on this account';
  return 'NHL Pro is active on this account';
}

export { ALL_ACCESS_OFFER, ALL_ACCESS_URL, MANAGE_URL, membershipBadgeHtml, planText };
