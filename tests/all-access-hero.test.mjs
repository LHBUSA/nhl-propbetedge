// PropBetEdge "All Access first" commercial hierarchy on the NHL surface.
//
//   FREE       -> All Access hero (primary) -> ONLY WANT NHL? -> NHL cards
//   SPORT_PRO  -> member panel + UPGRADE TO ALL ACCESS hero, no NHL purchase
//   ALL_ACCESS / OWNER -> no hero, no purchase CTA, no Stripe links
//
// Plus the chrome (header link, bottom tab, sheet row, footer links) and the
// hard geometry rule: no stylesheet may leave .pbepro__dialog with an internal
// scrollbar (overflow auto/scroll) or a numeric max-height.
// Run: node --test tests/all-access-hero.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_ACCESS_OFFER, ALL_ACCESS_URL, deriveMembership } from '../src/lib/pbe-membership.js';
import { SPORTS_LINE, SPORTS_NEXT, dividerHtml, heroHtml, shouldRenderHero } from '../src/lib/all-access-hero.js';
import { freeOfferHtml, memberPanelHtml, proButtonHtml, shortBadgeLabel } from '../src/lib/pro-membership-ui.js';
import { ALL_ACCESS_NAV } from '../src/components/shell.js';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const STRIPE = 'https://buy.stripe.com/8x2eVdgmOaqy4pv8Ez7wA0N';
const LEARN = 'https://propbetedge.ai/pro';
const rx = s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const m = {
  free: deriveMembership({ sport: 'nhl', entitled: false }),
  sport_pro: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'sport', productKey: 'nhl_pro', plan: 'monthly', email: 'fa***@example.com' }),
  all_access: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'all_access', productKey: 'pbe_all_access', plan: 'monthly', email: 'um***@example.com' }),
  owner: deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'owner', email: 'ow***@example.com' })
};

test('the hero carries the approved copy and the exact commercial facts from the shared contract', () => {
  assert.equal(ALL_ACCESS_OFFER.checkoutUrl, STRIPE, 'the live Stripe Payment Link (shared contract, never edited here)');
  assert.equal(ALL_ACCESS_URL, LEARN);
  const html = heroHtml(m.free);
  assert.match(html, /^<aside class="nhl-aa-hero" data-nhl-all-access="hero" data-nhl-all-access-state="free" aria-label="PropBetEdge All Access">/);
  assert.match(html, /<span class="nhl-aa-eyebrow">PROPBETEDGE NETWORK<\/span>/);
  assert.match(html, /<span class="nhl-aa-badge">BEST VALUE · MOST COMPLETE<\/span>/);
  assert.match(html, /<h3 class="nhl-aa-title">ALL ACCESS<\/h3>/);
  assert.match(html, /<span class="nhl-aa-price" aria-label="\$29\/month"><strong>\$29<\/strong>\/month<\/span>/);
  assert.match(html, /<p class="nhl-aa-tagline">Every current and future PropBetEdge Pro sport\.<\/p>/);
  assert.equal(SPORTS_LINE, 'MLB · NFL · NBA · NHL · WNBA · UFC · Tennis');
  assert.equal(SPORTS_NEXT, 'plus every Pro sport added next.');
  assert.match(html, /<p class="nhl-aa-sports"><b>MLB · NFL · NBA · NHL · WNBA · UFC · Tennis<\/b> <span>plus every Pro sport added next\.<\/span><\/p>/);
  assert.match(html, /<p class="nhl-aa-promo">Launch offer: 25% off while active with code <b class="nhl-aa-code">THEEDGE25<\/b><\/p>/);
  assert.match(html, new RegExp(`<a class="nhl-aa-cta" href="${rx(STRIPE).source}" rel="noopener" data-pbe-placement="all_access_checkout" data-nhl-all-access-cta="checkout">GET ALL ACCESS</a>`), 'GET ALL ACCESS -> exactly the Stripe link');
  assert.match(html, new RegExp(`<a class="nhl-aa-learn" href="${rx(LEARN).source}" rel="noopener" data-nhl-all-access-cta="learn">WHAT'S INCLUDED</a>`));
  assert.equal((html.match(/buy\.stripe\.com/g) || []).length, 1, 'one checkout link, the All Access one');
  assert.doesNotMatch(html, /Labs|computational/i, 'no Labs / future computational products');
  assert.equal(dividerHtml(), '<div class="nhl-aa-divider" role="separator" aria-label="ONLY WANT NHL?" data-nhl-all-access="divider"><span>ONLY WANT NHL?</span></div>');
});

test('states: free -> hero + seam; sport_pro -> UPGRADE hero, no seam; all_access / owner -> nothing', () => {
  assert.equal(shouldRenderHero(m.free), true);
  assert.equal(shouldRenderHero(m.sport_pro), true);
  assert.equal(shouldRenderHero(m.all_access), false);
  assert.equal(shouldRenderHero(m.owner), false);
  assert.equal(shouldRenderHero(null), true, 'an unresolved account renders the free hero (never widens access, only the offer)');

  const free = freeOfferHtml(m.free);
  assert.ok(free.startsWith('<aside class="nhl-aa-hero"'), 'hero first');
  assert.ok(free.endsWith('<span>ONLY WANT NHL?</span></div>'), 'then the seam, so the NHL cards follow');

  const up = heroHtml(m.sport_pro);
  assert.match(up, /class="nhl-aa-hero is-upgrade" data-nhl-all-access="hero" data-nhl-all-access-state="sport_pro"/);
  assert.match(up, /<h3 class="nhl-aa-title">UPGRADE TO ALL ACCESS<\/h3>/);
  assert.match(up, rx(STRIPE));
  assert.equal(freeOfferHtml(m.sport_pro), '', 'no free offer block for a member');
  const panel = memberPanelHtml(m.sport_pro);
  assert.match(panel, /UPGRADE TO ALL ACCESS/);
  assert.doesNotMatch(panel, /ONLY WANT NHL|data-pro-plan|\$9\.99|\$3\.99/, 'no NHL purchase for NHL PRO ACTIVE');

  for (const state of ['all_access', 'owner']) {
    assert.equal(heroHtml(m[state]), '', `${state}: no hero`);
    assert.equal(freeOfferHtml(m[state]), '', `${state}: no offer`);
    const html = memberPanelHtml(m[state]);
    assert.doesNotMatch(html, /nhl-aa-hero|GET ALL ACCESS|THEEDGE25|\$29|buy\.stripe\.com|data-pro-plan|ONLY WANT NHL/i, `${state}: no purchase CTA, no Stripe link`);
  }
});

test('legacy tiers stay visible where the contract exposes them (founding / season pass are sport_pro)', () => {
  const founding = deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'sport', legacyTier: 'founding', email: 'f@x.y' });
  assert.equal(founding.label, 'FOUNDING MEMBER');
  const panel = memberPanelHtml(founding);
  assert.match(panel, /FOUNDING MEMBER/);
  assert.match(panel, /UPGRADE TO ALL ACCESS/, 'a founding member is still offered the umbrella');
  assert.doesNotMatch(panel, /pbe-mbr-manage/, 'nothing to manage without billing');
  const season = deriveMembership({ sport: 'nhl', entitled: true, accessSource: 'sport', legacyTier: 'season_pass', currentPeriodEnd: '2027-04-30T12:00:00.000Z' });
  assert.match(memberPanelHtml(season), /NHL SEASON PASS/);
});

test('the purchase surface renders hero -> seam -> NHL cards -> NHL CTA in that DOM order; the NHL facts are untouched', () => {
  const pro = read('src/lib/pro.js');
  const order = ['id="nhl-pro-all-access"', 'pbepro__purchase-head', 'planCardsHtml(NHL_PRO_PLANS)', 'id="nhl-pro-checkout"', 'id="nhl-pro-signin"', 'id="nhl-pro-account"'].map(s => pro.indexOf(s));
  assert.ok(order.every(i => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]), `DOM order ${order.join(' < ')}`);
  assert.match(pro, /price: '\$9\.99'/); assert.match(pro, /price: '\$3\.99'/);
  assert.match(pro, /plink_1UEWmLF3CaVzg4ORwxmpwjSz/); assert.match(pro, /plink_1UEWmSF3CaVzg4ORdWk3Yqcj/);
  assert.match(pro, /https:\/\/buy\.stripe\.com\/14AbJ13A2fKS3lr8Ez7wA0B/); assert.match(pro, /https:\/\/buy\.stripe\.com\/6oUfZh6MegOW9JP4oj7wA0C/);
  assert.match(pro, /const OPEN_FOR_PURCHASE = true/);
  assert.doesNotMatch(pro, /best value/i, 'All Access owns "Best value"');
  assert.match(pro, /badge: 'Popular'/, 'the monthly card says Popular');
  assert.doesNotMatch(pro, rx(STRIPE), 'pro.js never hardcodes the All Access link; it comes from the contract through the hero');
  assert.match(read('src/lib/pro-membership-ui.js'), /import \{ dividerHtml, heroHtml \} from '\.\/all-access-hero\.js'/);
  assert.match(read('src/lib/all-access-hero.js'), /import \{ ALL_ACCESS_OFFER \} from '\.\/pbe-membership\.js'/, 'the hero reads the shared contract');
});

test('HARD RULE: no stylesheet leaves .pbepro__dialog with an internal scrollbar or a numeric max-height', () => {
  const dir = fileURLToPath(new URL('../src/styles/', import.meta.url));
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.css'));
  let seen = 0;
  for (const f of files) {
    const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // every rule block whose selector list names the dialog, at any media width
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = match[1].trim();
      if (!/\.pbepro__dialog(?![\w-])/.test(selectors)) continue;
      seen++;
      const body = match[2];
      const overflow = body.match(/overflow(?:-y)?\s*:\s*([^;]+)/g) || [];
      for (const decl of overflow) assert.doesNotMatch(decl, /auto|scroll/, `${f}: "${selectors}" -> ${decl.trim()}`);
      const maxH = body.match(/max-height\s*:\s*([^;]+)/g) || [];
      for (const decl of maxH) assert.match(decl, /:\s*none\s*$/, `${f}: "${selectors}" -> ${decl.trim()} (only max-height:none is allowed)`);
    }
  }
  assert.ok(seen >= 2, `the dialog rules were scanned (${seen})`);
  const pro = read('src/styles/pro.css');
  assert.match(pro, /\.pbepro\{[^}]*overflow-y:auto/, 'the backdrop is the one scroll context when a state ever outgrows the viewport');
  assert.match(pro, /html\.pbepro-lock\{overflow:hidden/, 'the page is locked behind it');
  assert.match(pro, /@media\(max-width:900px\)\{[\s\S]*?\.pbepro\{display:block;padding:0\}[\s\S]*?\.pbepro__dialog\{display:flex;flex-direction:column;width:100%;min-height:100%;margin:0;border:0;border-radius:0/, 'at <=900px the surface is a full-screen sheet (flex column, so the sticky close can travel) on the single page scroll container');
  assert.match(pro, /\.pbepro__close\{position:sticky;[^}]*order:-2;align-self:flex-end/, 'the close rides the sheet scroll');
  assert.match(pro, /@media\(min-width:901px\) and \(max-height:820px\)/, 'short desktop viewports get the compact geometry');
});

test('chrome: gold ALL ACCESS link in the header tools, bottom tab + sheet row on phones, two footer links (shell AND the premium footer)', () => {
  assert.deepEqual(ALL_ACCESS_NAV, { id: 'all-access', href: LEARN, label: 'All Access', short: 'All Access' });
  const shell = read('src/components/shell.js');
  const upgrade = read('src/components/chrome-upgrade.js');
  assert.match(shell, /id="nhl-all-access-link" href="\$\{ALL_ACCESS_NAV\.href\}"[^>]*data-all-access="header"/);
  assert.match(shell, /id="nhl-bottom-all-access" href="\$\{ALL_ACCESS_NAV\.href\}"[^>]*data-all-access="bottom"/);
  assert.match(shell, /id="nhl-sheet-all-access" href="\$\{ALL_ACCESS_NAV\.href\}"[^>]*data-all-access="sheet"/);
  assert.match(shell, /data-pbe-footer-all-access>ALL ACCESS<\/a>/);
  assert.match(shell, /data-pbe-footer-all-access-included>WHAT'S INCLUDED<\/a>/);
  // chrome-upgrade.js replaces the shell footer at runtime, so it carries the same two links.
  assert.match(upgrade, /import \{ ALL_ACCESS_URL \} from '\.\.\/lib\/pbe-membership\.js'/);
  assert.match(upgrade, /<a class="footer-premium__aa" href="\$\{ALL_ACCESS_URL\}" rel="noopener" data-pbe-footer-all-access>ALL ACCESS <span>/);
  assert.match(upgrade, /<a class="footer-premium__aa" href="\$\{ALL_ACCESS_URL\}" rel="noopener" data-pbe-footer-all-access-included>WHAT'S INCLUDED <span>/);
  assert.doesNotMatch(shell + upgrade, /buy\.stripe\.com/, 'chrome links to the network page, never to checkout');
  const shellCss = read('src/styles/shell.css');
  assert.match(shellCss, /\.topbar__aa \{[\s\S]*?background: linear-gradient\(135deg, var\(--pbe-gold-bright\), var\(--pbe-gold\)\)/, 'gold');
  assert.match(shellCss, /\.sheet__aa \{[\s\S]*?min-height: 56px/, 'a real target in the sheet');
  assert.match(read('src/styles/chrome-upgrade.css'), /\.footer-premium__links a\.footer-premium__aa \{ color:var\(--pbe-gold-bright\)/);
});

test('phone topbar: the header badge carries a short label and the chrome can shrink, so the page never overflows horizontally', () => {
  const acct = state => ({ state: 'pro', email: 'x@y.z', membership: m[state] });
  assert.equal(shortBadgeLabel(m.all_access), 'ALL ACCESS');
  assert.equal(shortBadgeLabel(m.sport_pro), 'NHL PRO');
  assert.equal(shortBadgeLabel(m.owner), 'OWNER');
  assert.equal(shortBadgeLabel(m.free), '');
  assert.match(proButtonHtml(acct('all_access')), /^<span class="pbe-mbr-badge is-all_access" data-pbe-membership="all_access">ALL ACCESS ACTIVE<b class="pbe-mbr-badge-short" aria-hidden="true">ALL ACCESS<\/b><\/span>$/);
  assert.match(proButtonHtml(acct('sport_pro')), /NHL PRO ACTIVE<b class="pbe-mbr-badge-short" aria-hidden="true">NHL PRO<\/b><\/span>$/);
  assert.match(proButtonHtml(acct('owner')), /OWNER<b class="pbe-mbr-badge-short" aria-hidden="true">OWNER<\/b><\/span>$/);
  assert.equal(proButtonHtml({ state: 'signed_out', membership: m.free }), '<span>NHL</span> PRO', 'free stays the neutral control');
  const pro = read('src/styles/pro.css');
  assert.match(pro, /\.pbe-mbr-badge-short\{display:none\}/, 'the short label is invisible above phone widths');
  assert.match(pro, /@media\(max-width:480px\)\{[\s\S]*?\.pbepro__open \.pbe-mbr-badge\{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0/, 'on phones the full label collapses and the badge truncates instead of the page');
  assert.match(pro, /\.pbepro__open \.pbe-mbr-badge-short\{display:inline;font:800 10px/, 'the short label is the visible one on phones');
  const shellCss = read('src/styles/shell.css');
  assert.match(shellCss, /@media \(max-width: 768px\) \{[\s\S]*?\.topbar__tools \{ margin-left: auto; flex: 0 1 auto; min-width: 0; \}[\s\S]*?\.topbar__tools \.pbepro__open \{ flex: 0 1 auto; min-width: 0; \}/, 'min-width:0 down the flex chain');
  assert.match(shellCss, /@media \(max-width: 400px\) \{[\s\S]*?\.brand__word \{ display: none; \}/, 'the wordmark yields under 400px; the mark + NHL chip remain');
  assert.doesNotMatch(read('src/lib/pbe-membership.js'), /badge-short/, 'the shared contract is untouched');
});
