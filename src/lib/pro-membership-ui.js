// NHL Pro membership UI — pure markup over the shared PropBetEdge membership
// contract (lib/pbe-membership.js, vendored; never edited here). No DOM, no CSS
// import, so tests can render every state.
//
// The membership object comes from nhl-gateway GET /auth/session, which
// derives it from the billing verdict (entitled + access_source). Nothing here
// decides access: an account that the gateway did not mark `pro` has the
// contract's non-entitled object, and that object never unlocks anything
// (readMembership never widens).
//
// Presentation (owner decisions 2026-10-05, network account standard): members
// read as NHL PRO MEMBER / ◆ PLATINUM (All Access, with its true product name
// beside it) / VERIFIED OWNER; a reader without access is never called FREE.
// See lib/account-surface.js for the designation map and the link constants.
import { esc } from './dom.js';
import {
  ALL_ACCESS_OFFER, ALL_ACCESS_URL, MANAGE_URL,
  membershipBadgeHtml, planText, readMembership
} from './pbe-membership.js';
import { dividerHtml, heroHtml } from './all-access-hero.js';
import {
  LOCAL_ALL_ACCESS_PATH, NHL_FREE_TOOLS, NHL_PRO_CAPABILITIES, PLATINUM_TRUTH, designation
} from './account-surface.js';

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

// The member designation shown in the header control and the verified card.
// Founding / season-pass sport members keep their factual tier names.
export function badgeLabel(m) {
  if (!m?.entitled) return '';
  if (m.state === 'sport_pro' && m.legacy_tier === 'founding') return 'NHL FOUNDING MEMBER';
  if (m.state === 'sport_pro' && m.legacy_tier === 'season_pass') return 'NHL SEASON PASS';
  return designation(m.state)?.badge || '';
}

// The phone-width label for the header badge (styles/pro.css swaps it in
// under 480px); the button's aria-label still carries the full designation.
export function shortBadgeLabel(m) {
  if (!m?.entitled) return '';
  if (m.legacy_tier === 'founding') return 'FOUNDING';
  if (m.legacy_tier === 'season_pass') return 'SEASON PASS';
  return designation(m.state)?.short || '';
}

// Header control. Members get their designation badge (contract badge classes
// for styling, presentation label) with the short phone label inside; every
// other state (unresolved, signed out, ended, access check) keeps the same
// neutral "NHL PRO" markup, so the control never flickers or says FREE.
/** A member's designation badge (contract badge classes, presentation label). */
export function memberBadgeHtml(m) {
  if (!m?.entitled) return '';
  return `<span class="pbe-mbr-badge is-${esc(m.state)}" data-pbe-membership="${esc(m.state)}">${esc(badgeLabel(m))}</span>`;
}

export function proButtonHtml(account) {
  const m = accountMembership(account);
  if (!m.entitled) return '<span>NHL</span> PRO';
  return `<span class="pbe-mbr-badge is-${esc(m.state)}" data-pbe-membership="${esc(m.state)}">${esc(badgeLabel(m))}<b class="pbe-mbr-badge-short" aria-hidden="true">${esc(shortBadgeLabel(m))}</b></span>`;
}

export function proButtonLabel(account, authReady = false) {
  const m = accountMembership(account);
  if (m.entitled) return `${badgeLabel(m)} — account and membership`;
  if (account?.state === 'unavailable') return 'NHL Pro access check — open account';
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

// ABOVE the NHL cards for readers without access only: the All Access hero (the
// primary offer) followed by the "ONLY WANT NHL?" seam. Empty for every member.
export function freeOfferHtml(m) {
  return m?.state === 'free' ? `${heroHtml(m)}${dividerHtml()}` : '';
}

// The capability grid: what NHL Pro gates on the server. `unlocked` paints the
// member treatment (green, links into the product); otherwise it is the
// prospect map (gold, no links) with the free tools named separately.
export function capabilityGridHtml({ unlocked = false } = {}) {
  const items = NHL_PRO_CAPABILITIES.map(c => unlocked
    ? `<li><a href="${esc(c.href)}" data-pro-close><i aria-hidden="true"></i><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></a></li>`
    : `<li><div><i aria-hidden="true"></i><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></div></li>`).join('');
  return `<section class="pbepro__caps${unlocked ? ' is-unlocked' : ''}" aria-label="${unlocked ? 'Unlocked on this account' : 'What NHL Pro contains'}">
    <h3>${unlocked ? 'UNLOCKED ON THIS ACCOUNT' : 'WHAT NHL PRO CONTAINS'}</h3>
    <ul>${items}</ul>
    ${unlocked ? '' : `<p class="pbepro__free">Free for every reader: ${esc(NHL_FREE_TOOLS.join(' · '))}.</p>`}
  </section>`;
}

// The verified-account card for a member.
export function verifiedCardHtml(m) {
  const d = designation(m?.state);
  if (!m?.entitled || !d) return '';
  const renewal = m.state === 'owner' ? '' : renewalText(m);
  const plan = m.state === 'all_access' ? PLATINUM_TRUTH : m.state === 'owner' ? 'Owner access · no subscription required' : planText(m);
  return `<section class="pbepro__verified is-${esc(d.tone)}" aria-label="Verified account">
    <div class="pbepro__verified-top"><span>VERIFIED ACCOUNT</span><b class="pbepro__badge is-${esc(d.tone)}">${esc(badgeLabel(m))}</b></div>
    ${m.email ? `<div class="pbepro__verified-email">${esc(m.email)}</div>` : ''}
    <div class="pbepro__verified-meta"><span>${esc(d.status)}</span><span>${esc(plan)}</span>${renewal ? `<span>${esc(renewal)}</span>` : ''}</div>
  </section>`;
}

// The member panel: designation head, verified card, unlocked grid, actions
// that go INTO the product, manage only when there is a subscription to
// manage, refresh, the local network page, sign out. NHL Pro members get the
// All Access expansion as a secondary block; Platinum and owner see no
// purchase CTA anywhere.
export function memberPanelHtml(m) {
  const d = designation(m?.state);
  if (!m?.entitled || !d) return '';
  const head = m.state === 'owner' ? 'Owner access is active.' : m.state === 'all_access' ? 'Platinum access is active.' : "You're in.";
  const lede = m.state === 'all_access'
    ? 'Your PropBetEdge All Access membership unlocks the full network — 10 sports plus PropBetEdge Predictions. NHL is one of them.'
    : m.state === 'owner' ? 'Every NHL Pro surface is unlocked on this verified owner account. No subscription required.'
    : 'NHL Pro is live on this account: official PBE Picks with their provenance, market context at lock, player fatigue and the Pro intelligence tier.';
  return `<div class="pbepro__member" data-member="${esc(m.state)}">
    <span class="pbepro__eyebrow is-member">${esc(d.eyebrow)}</span>
    <h3 class="pbepro__member-head">${esc(head)}</h3>
    <p class="pbepro__member-lede">${esc(lede)}</p>
    ${verifiedCardHtml(m)}
    ${capabilityGridHtml({ unlocked: true })}
    <div class="pbepro__actions">
      <a class="pbepro__go" href="#/pbe-picks" data-pro-close>Open the hockey desk →</a>
      ${m.show_manage ? `<a class="pbepro__btn" href="${esc(MANAGE_URL)}" target="_blank" rel="noopener noreferrer">Manage membership ↗</a>` : ''}
      <button type="button" class="pbepro__btn" data-pro-refresh>Refresh verified access</button>
      <a class="pbepro__btn" href="${LOCAL_ALL_ACCESS_PATH}">${m.state === 'sport_pro' ? 'PropBetEdge All Access' : 'Your network →'}</a>
      <button type="button" class="pbepro__btn" data-pro-signout>Sign out</button>
    </div>
    ${m.show_all_access_upgrade ? `<div class="pbepro__expand">${heroHtml(m)}</div>` : ''}
    <p class="pbepro__secure is-member">◆ ${esc(d.status)} · verified by PropBetEdge${m.state === 'owner' ? ' · no subscription required' : ''}</p>
  </div>`;
}

// The gateway answered not_entitled: NHL Pro sign-in is paid-only, so the
// gateway has already ended this browser's session (no email is returned).
// State the truth and offer the real options; never FREE, never a pretend
// signed-in identity.
export function endedPanelHtml() {
  return `<div class="pbepro__state" data-state="ended">
    <span class="pbepro__eyebrow">NHL PRO · ACCESS ENDED</span>
    <h3 class="pbepro__member-head">NHL Pro access is no longer active.</h3>
    <p class="pbepro__member-lede">This browser's NHL Pro session ended because no active NHL Pro or All Access membership is attached to it. Renew below, or sign in again once your membership is active.</p>
  </div>`;
}

// The gateway could not verify access (outage or no answer). Nothing about the
// membership changes, so nothing is sold: retry, or sign out.
export function checkPanelHtml() {
  return `<div class="pbepro__state" data-state="check">
    <span class="pbepro__eyebrow">NHL PRO · ACCESS CHECK</span>
    <h3 class="pbepro__member-head">Access check temporarily unavailable.</h3>
    <p class="pbepro__member-lede">We couldn't verify NHL Pro access right now. Your membership has not changed, and every public NHL page keeps working.</p>
    <div class="pbepro__protect"><b>Your account is not being treated as unsubscribed.</b> Pricing and upgrade prompts stay hidden until verification answers cleanly.</div>
    <div class="pbepro__actions">
      <button type="button" class="pbepro__go" data-pro-refresh>Retry verified access</button>
      <button type="button" class="pbepro__btn" data-pro-signout>Sign out</button>
    </div>
  </div>`;
}

// The story column per view: the NHL voice for prospects, ownership for
// members, protection for the access check. Pure copy; no protected values.
export function storyCopy(view) {
  if (view === 'all_access') return { eyebrow: 'NHL · PLATINUM MEMBER', title: 'Your full NHL desk <br><em>is unlocked.</em>', lede: 'PropBetEdge All Access covers this account: every NHL Pro surface here, and the rest of the network on the same membership.' };
  if (view === 'owner') return { eyebrow: 'NHL · VERIFIED OWNER', title: 'The full NHL desk, <br><em>unlocked.</em>', lede: 'Verified server-side by the NHL gateway. Every NHL Pro surface is open, with no subscription required.' };
  if (view === 'sport_pro') return { eyebrow: 'NHL PRO · VERIFIED', title: 'See the game before <br><em>the score tells you.</em>', lede: 'Official PBE Picks with their provenance, market context at lock and the Pro intelligence tier are open on this account.' };
  if (view === 'check') return { eyebrow: 'NHL PRO · ACCESS CHECK', title: 'Your access <br><em>is protected.</em>', lede: 'While verification is unavailable, nothing about your membership changes, and public NHL intelligence keeps working.' };
  return { eyebrow: 'PROPBETEDGE NHL · HOCKEY INTELLIGENCE', title: 'See the game before <br><em>the score tells you.</em>', lede: 'PBE Picks are locked before puck drop with their model, probability and provenance, then graded at the final. NHL Pro opens the calls and the Pro intelligence behind them.' };
}

// PBE Picks Pro block heading for members, from the designation.
export function picksProHeading(m) {
  if (m?.state === 'owner') return 'Owner access is active on this account';
  if (m?.state === 'all_access') return 'Platinum access is active on this account';
  return 'NHL Pro is active on this account';
}

export { ALL_ACCESS_OFFER, ALL_ACCESS_URL, MANAGE_URL, membershipBadgeHtml, planText };
