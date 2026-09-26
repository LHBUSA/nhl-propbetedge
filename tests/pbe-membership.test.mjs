// Shared PropBetEdge membership contract on the NHL surface.
//
// The membership object is produced by nhl-gateway from the billing verdict;
// the browser only reads it (readMembership) and renders. These tests pin the
// rendering per state — no purchase CTA for all_access / owner, the All Access
// hero FIRST then the ONLY WANT NHL? seam then both NHL cards for free readers,
// the UPGRADE TO ALL ACCESS hero for sport_pro, the correct plan line for All
// Access — and the copy rules (no "Stripe" as a state word, no "Charged today"
// while checkout is closed). Run: node --test tests/pbe-membership.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ALL_ACCESS_OFFER, CONTRACT_VERSION, MANAGE_URL, deriveMembership, readMembership
} from '../src/lib/pbe-membership.js';
import {
  accountMembership, freeOfferHtml, memberPanelHtml, picksProHeading, planCardsHtml, proButtonHtml, proButtonLabel, renewalText
} from '../src/lib/pro-membership-ui.js';
import { proBlock } from '../src/pages/pbe-picks.js';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const proSource = read('src/lib/pro.js');
const mainSource = read('src/main.js');
const shellSource = read('src/components/shell.js');
const accountSource = read('src/lib/account.js');
const verifySource = read('src/pages/auth-verify.js');
const sharedCss = read('src/styles/pbe-membership.css');

// The NHL plan facts the pricing contract pins, read from pro.js without
// importing it (pro.js touches document at load).
const PLANS = {
  monthly: { label: 'Monthly', badge: 'Popular', price: '$9.99', cadence: '/ month', detail: 'Founding Season rate · Renews monthly · Cancel anytime', url: 'https://buy.stripe.com/14AbJ13A2fKS3lr8Ez7wA0B' },
  weekly: { label: 'Weekly', badge: 'Flexible', price: '$3.99', cadence: '/ week', detail: 'Founding Season rate · Renews weekly · Cancel anytime', url: 'https://buy.stripe.com/6oUfZh6MegOW9JP4oj7wA0C' }
};

// Gateway-shaped session bodies (what GET /auth/session returns per state).
// Midday UTC so the en-US date renders Oct 24 in every zone the suite runs in.
const END = '2026-10-24T12:00:00.000Z';
const gateway = {
  free: { state: 'signed_out', membership: deriveMembership({ sport: 'nhl', entitled: false }) },
  sportMonthly: { state: 'pro', email: 'fa***@example.com', subscription: { product_key: 'nhl_pro', plan: 'monthly', status: 'active', current_period_end: END, cancel_at_period_end: false },
    membership: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'sport', productKey: 'nhl_pro', plan: 'monthly', email: 'fa***@example.com', currentPeriodEnd: END }) },
  sportWeekly: { state: 'pro', email: 'fa***@example.com', subscription: { product_key: 'nhl_pro', plan: 'weekly', status: 'active', current_period_end: END, cancel_at_period_end: true },
    membership: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'sport', productKey: 'nhl_pro', plan: 'weekly', email: 'fa***@example.com', currentPeriodEnd: END, cancelAtPeriodEnd: true }) },
  allAccess: { state: 'pro', email: 'um***@example.com', subscription: { product_key: 'pbe_all_access', plan: 'monthly', status: 'active', current_period_end: END, cancel_at_period_end: false },
    membership: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'all_access', productKey: 'pbe_all_access', plan: 'monthly', email: 'um***@example.com', currentPeriodEnd: END }) },
  owner: { state: 'pro', email: 'ow***@example.com', subscription: null,
    membership: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'owner', email: 'ow***@example.com' }) }
};
const account = body => ({ state: body.state, email: body.email || null, subscription: body.subscription || null, membership: readMembership(body.state === 'pro' ? body.membership : null, 'nhl') });

test('the shared contract copy is 1.2.0 and the CSS is imported exactly once, never styling body', () => {
  assert.equal(CONTRACT_VERSION, '1.2.0');
  assert.equal(mainSource.match(/import '\.\/styles\/pbe-membership\.css';/g)?.length, 1, 'one import in main.js');
  assert.doesNotMatch(sharedCss, /(^|[\s,}])body\s*[{,]/m, 'the atmosphere rule: body stays transparent');
  assert.match(accountSource, /readMembership\(data\.state === 'pro' \? data\.membership : null, 'nhl'\)/, 'account.js keeps membership via readMembership');
});

test('account -> membership: only a gateway `pro` state is a member; malformed or missing objects are FREE', () => {
  assert.equal(accountMembership(null).state, 'free');
  assert.equal(accountMembership({ state: 'unknown' }).state, 'free');
  assert.equal(accountMembership({ state: 'signed_out', membership: gateway.allAccess.membership }).state, 'free', 'a non-pro state never carries a member object');
  assert.equal(accountMembership({ state: 'not_entitled', membership: { state: 'owner', entitled: true } }).state, 'free');
  assert.equal(accountMembership(account(gateway.allAccess)).state, 'all_access');
  assert.equal(accountMembership(account(gateway.owner)).state, 'owner');
  assert.equal(accountMembership(account(gateway.sportMonthly)).state, 'sport_pro');
  // A pro session from a gateway build without the contract is the sport plan, never All Access.
  const legacy = accountMembership({ state: 'pro', email: 'x@y.z', subscription: { plan: 'weekly' } });
  assert.deepEqual([legacy.state, legacy.label, legacy.plan], ['sport_pro', 'NHL PRO ACTIVE', 'weekly']);
});

test('header control: neutral "NHL PRO" for unresolved and free (no flicker), the membership badge for members', () => {
  const neutral = '<span>NHL</span> PRO';
  assert.equal(proButtonHtml(null), neutral);
  assert.equal(proButtonHtml({ state: 'unknown' }), neutral);
  assert.equal(proButtonHtml(account(gateway.free)), neutral);
  assert.equal(proButtonHtml({ state: 'not_entitled' }), neutral);
  assert.match(proButtonHtml(account(gateway.sportMonthly)), /class="pbe-mbr-badge is-sport_pro"[^>]*>NHL PRO ACTIVE</);
  assert.match(proButtonHtml(account(gateway.allAccess)), /class="pbe-mbr-badge is-all_access"[^>]*>ALL ACCESS ACTIVE</);
  assert.match(proButtonHtml(account(gateway.owner)), /class="pbe-mbr-badge is-owner"[^>]*>OWNER</);
  assert.doesNotMatch(proButtonHtml(account(gateway.sportMonthly)), /✓/, 'the old checkmark is gone');
  assert.equal(proButtonLabel(account(gateway.allAccess)), 'ALL ACCESS ACTIVE — account and subscription');
  assert.equal(proButtonLabel(null, false), 'See what NHL Pro includes');
  assert.match(shellSource, /button\.innerHTML = proButtonHtml\(account\)|const html = proButtonHtml\(account\)/, 'shell paints through the shared helper');
  assert.doesNotMatch(shellSource, /PRO ✓/);
});

test('free readers: the All Access hero FIRST, then ONLY WANT NHL?, then both NHL cards ($9.99 monthly, $3.99 weekly); no "Charged today" / "Secure checkout"', () => {
  const cards = planCardsHtml(PLANS);
  assert.match(cards, /data-pro-plan="monthly"[\s\S]*\$9\.99<\/strong><span>\/ month/);
  assert.match(cards, /data-pro-plan="weekly"[\s\S]*\$3\.99<\/strong><span>\/ week/);
  assert.equal((cards.match(/class="pbepro__plan"/g) || []).length, 2);
  assert.doesNotMatch(cards, /buy\.stripe\.com/, 'the cards never carry the checkout URL; checkout is the CTA, and it is closed');
  assert.doesNotMatch(cards, /best value/i, 'All Access owns "Best value"; no NHL card may claim it');

  const offer = freeOfferHtml(accountMembership(account(gateway.free)));
  assert.match(offer, /class="nhl-aa-hero" data-nhl-all-access="hero" data-nhl-all-access-state="free"/);
  assert.match(offer, /<h3 class="nhl-aa-title">ALL ACCESS<\/h3>/, 'FREE heading, not the upgrade heading');
  assert.match(offer, new RegExp(`data-nhl-all-access-cta="checkout">GET ALL ACCESS<`), 'the primary CTA');
  assert.match(offer, new RegExp(`href="${ALL_ACCESS_OFFER.checkoutUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*data-nhl-all-access-cta="checkout"`), 'the live All Access checkout, exactly');
  assert.match(offer, /aria-label="\$29\/month"><strong>\$29<\/strong>\/month/);
  assert.match(offer, /<b class="nhl-aa-code">THEEDGE25<\/b>/);
  assert.match(offer, /BEST VALUE · MOST COMPLETE/);
  assert.match(offer, /MLB · NFL · NBA · NHL · WNBA · UFC · Tennis/);
  assert.doesNotMatch(offer, /Labs/i, 'no Labs / future computational products are sold as included');
  assert.ok(offer.indexOf('data-nhl-all-access="hero"') < offer.indexOf('data-nhl-all-access="divider"'), 'hero, then the seam');
  assert.match(offer, /<span>ONLY WANT NHL\?<\/span>/);

  assert.match(proSource, /planCardsHtml\(NHL_PRO_PLANS\)/, 'pro.js renders the cards through the shared helper');
  const offerAt = proSource.indexOf('id="nhl-pro-all-access"');
  const cardsAt = proSource.indexOf('planCardsHtml(NHL_PRO_PLANS)');
  assert.ok(offerAt > 0 && offerAt < cardsAt, 'the All Access hero + seam render ABOVE the NHL cards at first paint');
  assert.match(proSource, /class="pbepro__offer pbepro__purchase-only" id="nhl-pro-all-access">\$\{freeOfferHtml\(accountMembership\(null\)\)\}/);
  assert.match(proSource, /const OPEN_FOR_PURCHASE = true/);
  assert.doesNotMatch(proSource, /Charged today/);
  assert.doesNotMatch(proSource, /Secure checkout/i);
  assert.doesNotMatch(proSource, /best value/i, 'no NHL plan card (or its head copy) says "Best value"');
});

test('copy rules: "Stripe" is never a state word and "Founding Season" is only the NHL rate label', () => {
  const prose = proSource.replace(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g, '').replace(/plink_[A-Za-z0-9]+/g, '');
  assert.doesNotMatch(prose, /Stripe/, 'no "Stripe" outside the payment-link URLs');
  for (const line of proSource.split('\n').filter(l => /Founding Season/.test(l))) {
    assert.match(line, /Founding Season (rate|checkout|pricing)|FOUNDING SEASON PRICING/i, `rate label only: ${line.trim()}`);
  }
  assert.doesNotMatch(proSource, /FOUNDING SEASON · NHL PRO|Founding Season access/);
  assert.match(verifySource, /This email has no active NHL Pro or All Access membership\./);
  assert.doesNotMatch(verifySource, /No active NHL Pro subscription/);
});

test('member panel — sport_pro: badge, plan line, manage link, network row, UPGRADE TO ALL ACCESS hero, no NHL purchase', () => {
  for (const [body, plan] of [[gateway.sportMonthly, 'monthly'], [gateway.sportWeekly, 'weekly']]) {
    const m = accountMembership(account(body));
    const html = memberPanelHtml(m);
    assert.match(html, /class="pbe-mbr-panel" data-pbe-membership="sport_pro"/);
    assert.match(html, /pbe-mbr-badge is-sport_pro[^>]*>NHL PRO ACTIVE</);
    assert.match(html, new RegExp(`<p class="pbe-mbr-plan">NHL Pro · ${plan}</p>`), 'plan line via planText');
    assert.match(html, /class="pbe-mbr-email">fa\*\*\*@example\.com</, 'the masked email the gateway exposes');
    assert.match(html, new RegExp(`class="pbe-mbr-manage" href="${MANAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), 'Manage link inside the panel (show_manage)');
    assert.match(html, /class="pbe-mbr-network"[\s\S]*aria-current="page" class="is-current">NHL</, 'network row with NHL current');
    assert.match(html, /href="https:\/\/propbetedge\.ai\/pro"[^>]*>PropBetEdge All Access</);
    assert.match(html, /class="nhl-aa-hero is-upgrade"[^>]*data-nhl-all-access-state="sport_pro"/, 'sport_pro gets the upgrade hero');
    assert.match(html, /<h3 class="nhl-aa-title">UPGRADE TO ALL ACCESS<\/h3>/);
    assert.match(html, new RegExp(`href="${ALL_ACCESS_OFFER.checkoutUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*data-nhl-all-access-cta="checkout">GET ALL ACCESS<`));
    assert.doesNotMatch(html, /ONLY WANT NHL/, 'no seam for a member: there is no NHL purchase beneath it');
    assert.match(html, /data-pro-signout/);
    assert.doesNotMatch(html, /class="pbepro__plan"|data-pro-plan|\$9\.99|\$3\.99/, 'no NHL plan cards inside the member panel');
    assert.equal(freeOfferHtml(m), '', 'the free offer block is empty for a member');
  }
  assert.equal(renewalText(accountMembership(account(gateway.sportMonthly))), 'Renews Oct 24, 2026');
  assert.equal(renewalText(accountMembership(account(gateway.sportWeekly))), 'Ends Oct 24, 2026');
});

test('member panel — all_access: ALL ACCESS ACTIVE, correct plan line (not blank), manage link, network, NO purchase CTA anywhere', () => {
  const m = accountMembership(account(gateway.allAccess));
  assert.deepEqual([m.state, m.label, m.plan, m.product_key], ['all_access', 'ALL ACCESS ACTIVE', 'monthly', 'pbe_all_access']);
  const html = memberPanelHtml(m);
  assert.match(html, /pbe-mbr-badge is-all_access[^>]*>ALL ACCESS ACTIVE</);
  assert.match(html, /<p class="pbe-mbr-plan">All Access · every PropBetEdge sport<\/p>/, 'the plan line that used to render blank');
  assert.match(html, /class="pbe-mbr-manage"/, 'manage link');
  assert.match(html, /href="https:\/\/propbetedge\.ai\/pro"[^>]*>Your network</);
  assert.match(html, /class="pbe-mbr-network"/);
  assert.doesNotMatch(html, /pbe-mbr-aa|nhl-aa-hero|GET ALL ACCESS|Get All Access|THEEDGE25|buy\.stripe\.com|pbepro__plan"|data-open-nhl-pro/i, 'no purchase CTA of any kind');
  assert.equal(freeOfferHtml(m), '', 'no All Access hero for an All Access member');
  assert.equal(renewalText(m), 'Renews Oct 24, 2026');
  assert.doesNotMatch(html, /NHL Pro ·|NHL PRO ACTIVE/, 'no sport-only language for All Access');
});

test('member panel — owner: OWNER, "Owner access", no manage link, no purchase CTA', () => {
  const m = accountMembership(account(gateway.owner));
  const html = memberPanelHtml(m);
  assert.match(html, /pbe-mbr-badge is-owner[^>]*>OWNER</);
  assert.match(html, /<p class="pbe-mbr-plan">Owner access<\/p>/);
  assert.doesNotMatch(html, /pbe-mbr-manage|billing\.stripe\.com/, 'owner has nothing to manage');
  assert.doesNotMatch(html, /pbe-mbr-aa|nhl-aa-hero|GET ALL ACCESS|Get All Access|THEEDGE25|buy\.stripe\.com|data-open-nhl-pro/i);
  assert.equal(freeOfferHtml(m), '');
  assert.equal(renewalText(m), '');
});

test('members never see the NHL purchase controls; free readers do', () => {
  assert.equal(memberPanelHtml(accountMembership(account(gateway.free))), '', 'no panel for free');
  assert.match(proSource, /panel\.innerHTML = pro \? memberPanelHtml\(m\) : ''/);
  assert.match(proSource, /root\.dataset\.membership = m\.state/);
  const css = read('src/styles/pro.css');
  assert.match(css, /\.pbepro\[data-membership\]:not\(\[data-membership='free'\]\) \.pbepro__purchase-only\{display:none!important\}/);
  for (const hook of ['pbepro__purchase-head pbepro__purchase-only', 'pbepro__plans pbepro__purchase-only', 'pbepro__cta pbepro__purchase-only', 'pbepro__offer pbepro__purchase-only']) {
    assert.match(proSource, new RegExp(hook), `${hook} is purchase-only`);
  }
});

test('PBE Picks Pro block: heading and badge from the membership label; free keeps the NHL Pro CTA', () => {
  const free = proBlock({ account: account(gateway.free) });
  assert.match(free, /data-pbe-membership="free"/);
  assert.match(free, /What NHL Pro adds to this page/);
  assert.match(free, /data-open-nhl-pro>See NHL Pro</);
  assert.match(free, /active NHL Pro or All Access membership/);

  const sport = proBlock({ account: account(gateway.sportMonthly) });
  assert.match(sport, /<h2 id="pks-pro-h">NHL Pro is active on this account<\/h2>/);
  assert.match(sport, /pbe-mbr-badge is-sport_pro[^>]*>NHL PRO ACTIVE</);
  assert.doesNotMatch(sport, /data-open-nhl-pro/);

  const aa = proBlock({ account: account(gateway.allAccess) });
  assert.match(aa, /<h2 id="pks-pro-h">All Access is active on this account<\/h2>/);
  assert.match(aa, /pbe-mbr-badge is-all_access[^>]*>ALL ACCESS ACTIVE</);
  assert.doesNotMatch(aa, /data-open-nhl-pro|buy\.stripe\.com/);

  const owner = proBlock({ account: account(gateway.owner) });
  assert.match(owner, /Owner access is active on this account/);
  assert.match(owner, /pbe-mbr-badge is-owner[^>]*>OWNER</);
  assert.equal(picksProHeading(accountMembership({ state: 'pro' })), 'NHL Pro is active on this account');
});
