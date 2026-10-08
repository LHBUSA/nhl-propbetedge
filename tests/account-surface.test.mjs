// NHL premium account surface + native /all-access page (owner decisions
// 2026-10-05): presentation-only Platinum, a real local /all-access page,
// separate link constants, every view rendered from the gateway verdict.
// Run: node --test tests/account-surface.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ALL_ACCESS_OFFER, ALL_ACCESS_URL, STATES, deriveMembership } from '../src/lib/pbe-membership.js';
import {
  ALL_ACCESS_CHECKOUT_URL, LOCAL_ALL_ACCESS_PATH, NETWORK_ALL_ACCESS_URL, NHL_PRO_CAPABILITIES, OFFER_LINE, PLATINUM_TRUTH,
  accountView, designation, networkSports, predictionsProduct, sportsLine
} from '../src/lib/account-surface.js';
import { checkPanelHtml, endedPanelHtml, memberPanelHtml, proButtonHtml, storyCopy } from '../src/lib/pro-membership-ui.js';
import { PBE_NETWORK } from '../src/lib/network.js';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const family = JSON.parse(read('src/lib/family.json'));
const STRIPE = 'https://buy.stripe.com/8x2eVdgmOaqy4pv8Ez7wA0N';
const mem = state => deriveMembership({ sport: 'nhl', entitled: state !== 'free', accessSource: state === 'sport_pro' ? 'sport' : state === 'free' ? null : state, plan: 'monthly', email: 'xx***@example.com', currentPeriodEnd: '2026-11-05T12:00:00.000Z' });

test('three link jobs, three constants; price, promo and checkout unchanged', () => {
  assert.equal(LOCAL_ALL_ACCESS_PATH, '/all-access');
  assert.equal(NETWORK_ALL_ACCESS_URL, ALL_ACCESS_URL);
  assert.equal(ALL_ACCESS_CHECKOUT_URL, STRIPE);
  assert.equal(ALL_ACCESS_OFFER.price, '$29/month');
  assert.equal(ALL_ACCESS_OFFER.promoCode, 'THEEDGE25');
});

test('designations: Platinum is presentation for all_access; NHL PRO MEMBER; VERIFIED OWNER; FREE has none', () => {
  assert.deepEqual(STATES, ['free', 'sport_pro', 'all_access', 'owner'], 'backend states unchanged');
  assert.equal(designation('all_access').badge, '◆ PLATINUM');
  assert.equal(designation('all_access').eyebrow, 'NHL · PLATINUM MEMBER');
  assert.equal(designation('all_access').status, 'PLATINUM ACCESS ACTIVE');
  assert.equal(PLATINUM_TRUTH, 'PropBetEdge All Access · 10 sports + Predictions');
  assert.equal(designation('sport_pro').badge, 'NHL PRO MEMBER');
  assert.equal(designation('owner').badge, 'VERIFIED OWNER');
  assert.equal(designation('free'), null);
  for (const s of STATES) assert.doesNotMatch(JSON.stringify(designation(s)), /Platinum plan/i);
});

test('view machine: gateway outage is the access check, never signed out, never FREE or a sale', () => {
  const free = mem('free');
  assert.equal(accountView({ state: 'unknown' }, free), 'loading');
  assert.equal(accountView({ state: 'signed_out' }, free), 'signed_out');
  assert.equal(accountView({ state: 'unavailable' }, free), 'check');
  assert.equal(accountView({ state: 'not_entitled' }, free), 'ended');
  assert.equal(accountView({ state: 'pro' }, mem('sport_pro')), 'sport_pro');
  assert.equal(accountView({ state: 'pro' }, mem('all_access')), 'all_access');
  assert.equal(accountView({ state: 'pro' }, mem('owner')), 'owner');
  const check = checkPanelHtml();
  assert.match(check, /Access check temporarily unavailable\./);
  assert.match(check, /data-pro-refresh>Retry verified access</);
  assert.match(check, /data-pro-signout>Sign out</);
  assert.doesNotMatch(check, /buy\.stripe|GET ALL ACCESS|\$29|data-pro-plan|\bFREE\b/i, 'the access check sells nothing');
  assert.equal(proButtonHtml({ state: 'unavailable' }), '<span>NHL</span> PRO');
  const ended = endedPanelHtml();
  assert.match(ended, /NHL Pro access is no longer active\./);
  assert.doesNotMatch(ended, /\bFREE\b/);
  for (const v of ['loading', 'signed_out', 'ended', 'check', 'sport_pro', 'all_access', 'owner']) assert.doesNotMatch(JSON.stringify(storyCopy(v)), /\bFREE\b/);
  const acct = read('src/lib/account.js');
  assert.match(acct, /if \(status === 0 \|\| status >= 500\) return publish\(\{ state: 'unavailable' \}\);/, 'no answer / 5xx -> unavailable');
  assert.match(acct, /authCall\('\/auth\/session', \{ timeoutMs: SESSION_TIMEOUT_MS \}\)/, 'the session read has a timeout');
  assert.match(acct, /\} catch \{\r?\n\s*return publish\(\{ state: 'unavailable' \}\);/);
});

test('Platinum and owner: no purchase CTA; NHL Pro: only the explicit UPGRADE goes to Stripe', () => {
  for (const s of ['all_access', 'owner']) {
    const html = memberPanelHtml(mem(s));
    assert.doesNotMatch(html, /buy\.stripe|GET ALL ACCESS|UPGRADE TO ALL ACCESS|THEEDGE25|data-pro-plan/i, `${s}: no purchase`);
  }
  const pro = memberPanelHtml(mem('sport_pro'));
  assert.equal((pro.match(/buy\.stripe\.com/g) || []).length, 1);
  assert.match(pro, /href="https:\/\/buy\.stripe\.com\/8x2eVdgmOaqy4pv8Ez7wA0N"[^>]*>UPGRADE TO ALL ACCESS</);
});

test('network: 10 sports + PropBetEdge Predictions from the registry; Predictions never a sport', () => {
  assert.deepEqual(networkSports().map(s => s.id), family.sports.map(s => s.key), 'PBE_NETWORK sports == canonical family.json, in order');
  assert.equal(networkSports().length, 10);
  assert.equal(predictionsProduct().href, family.products.find(p => p.key === 'predictions').url);
  assert.ok(!PBE_NETWORK.sports.some(s => s.id === 'predictions'));
  assert.equal(sportsLine(), 'MLB · NFL · NBA · WNBA · NHL · UFC · Tennis · Soccer · Golf · F1 Intelligence');
  assert.equal(OFFER_LINE, '10 sports + PropBetEdge Predictions');
});

test('/all-access is a real local page: own canonical, indexable, no redirect constructs, one local rewrite', () => {
  const html = read('all-access.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/nhl\.propbetedge\.ai\/all-access" \/>/);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.match(html, /<title>PropBetEdge All Access on NHL — 10 sports \+ Predictions, \$29\/month<\/title>/);
  assert.match(html, /<script src="\/pbe-consent-v1\.js"><\/script>/, 'same consent runtime as the app');
  assert.doesNotMatch(html, /http-equiv="refresh"|<iframe|window\.location|location\.replace/i);
  const page = strip(read('src/all-access-main.js'));
  assert.doesNotMatch(page, /propbetedge\.ai\/pro|<iframe|location\.replace|http-equiv/);
  assert.doesNotMatch(page.replace(/location\.assign\(`\/\$\{hash\}`\)/, ''), /location\.(assign|href\s*=)/, 'the only navigation is the in-site hash hand-off to the app');
  assert.equal((page.match(/href="\$\{esc\(ALL_ACCESS_CHECKOUT_URL\)\}"/g) || []).length, 2, 'Get All Access (prospect / ended) and Upgrade to All Access (NHL Pro) only');
  const member = page.slice(page.indexOf("if (view === 'all_access' || view === 'owner')"), page.indexOf("if (view === 'sport_pro')"));
  assert.doesNotMatch(member, /ALL_ACCESS_CHECKOUT_URL|buy\.stripe|Get All Access|Upgrade to All Access/i, 'no purchase for Platinum or owner');
  const vercel = JSON.parse(read('vercel.json'));
  // /all-access is a local file rewrite, not a redirect; the only other rewrites are the fixed
  // Kalshi partner routes (kalshi-partner/2, pinned in tests/kalshi-partner.test.mjs).
  assert.deepEqual(vercel.rewrites.filter(r => !r.source.startsWith('/go/kalshi-perps')), [{ source: '/all-access', destination: '/all-access.html' }], 'a local file rewrite, not a redirect');
  assert.deepEqual(vercel.rewrites.filter(r => r.source.startsWith('/go/')).map(r => r.source), ['/go/kalshi-perps/config', '/go/kalshi-perps']);
  assert.equal(vercel.redirects, undefined);
  assert.match(read('vite.config.js'), /allAccess: resolve\(__dirname, 'all-access\.html'\)/);
});

test('capability grid lists only what NHL Pro gates server-side; picks are never sold as priced', () => {
  assert.deepEqual(NHL_PRO_CAPABILITIES.map(c => c.key), ['picks', 'provenance', 'market', 'fatigue', 'winhl', 'game-intel']);
  assert.match(NHL_PRO_CAPABILITIES.find(c => c.key === 'market').sub, /where priced/);
  for (const c of NHL_PRO_CAPABILITIES) assert.match(c.href, /^#\//);
});
