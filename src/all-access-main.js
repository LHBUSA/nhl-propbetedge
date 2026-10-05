// PropBetEdge NHL — the native All Access page (/all-access).
//
// Owner decision 2026-10-05: All Access navigation stays on the sport site. This
// is a real page (all-access.html, its own canonical), never a redirect, an
// iframe or a forward to propbetedge.ai. It wears the same NHL chrome as the app
// and renders ONE view per gateway verdict (lib/account-surface.js):
//   signed_out / loading -> the All Access offer (GET ALL ACCESS + SIGN IN)
//   ended                -> NHL Pro access is no longer active + renew options
//   check                -> access check, nothing sold
//   sport_pro            -> NHL PRO MEMBER + what upgrading adds
//   all_access           -> PLATINUM MEMBER network dashboard, every product OPEN
//   owner                -> VERIFIED OWNER, network unlocked, no checkout
// Only the explicit GET / UPGRADE TO ALL ACCESS button reaches Stripe.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/backdrops.css';
import './styles/atmosphere.css';
import './styles/chrome-upgrade.css';
import './styles/preferred-source.css';
import './styles/pbe-membership.css';
import './styles/all-access-page.css';

import { bindShell, renderShell } from './components/shell.js';
import { upgradeChrome } from './components/chrome-upgrade.js';
import { mountPreferredSource } from './components/preferred-source.js';
import { onAccount, refreshAccount, signInAvailable, signOut } from './lib/account.js';
import { accountMembership, capabilityGridHtml, verifiedCardHtml } from './lib/pro-membership-ui.js';
import { ALL_ACCESS_OFFER, MANAGE_URL } from './lib/pbe-membership.js';
import { PREDICTIONS_BLURB } from './lib/all-access-hero.js';
import {
  ALL_ACCESS_CHECKOUT_URL, NHL_FREE_TOOLS, OFFER_LINE, PLATINUM_TRUTH, SECONDARY_LINE,
  accountView, designation, displaySport, networkSports, predictionsProduct
} from './lib/account-surface.js';
import { esc } from './lib/dom.js';

const app = document.querySelector('#app');
const main = renderShell(app);
upgradeChrome();
mountPreferredSource();
bindShell({ slateGames: () => [] });
import('./lib/pro.js').catch(error => console.error('[nhl-pro] failed to load', error));
document.documentElement.classList.add('aap-page');

// The app's sections are hash routes on "/"; from this page they must open the
// app, not stay on /all-access with a hash. One delegated rewrite + a hashchange
// forward cover the nav, the sheet, the palette and in-panel links.
function toApp(hash) { location.assign(`/${hash}`); }
document.addEventListener('click', event => {
  const a = event.target.closest('a[href^="#/"]');
  if (!a || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  toApp(a.getAttribute('href'));
});
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) toApp(location.hash); });
for (const a of document.querySelectorAll('a[href^="#/"]')) a.setAttribute('href', `/${a.getAttribute('href')}`);

const PRICE = ALL_ACCESS_OFFER.price;
const promoHtml = () => esc(ALL_ACCESS_OFFER.promoLine).replace(esc(ALL_ACCESS_OFFER.promoCode), `<b>${esc(ALL_ACCESS_OFFER.promoCode)}</b>`);
const story = {
  prospect: { eyebrow: 'PROPBETEDGE NETWORK · ALL ACCESS', title: 'The hockey desk is one desk. <br><em>All Access opens the network.</em>', lede: 'PBE Picks locked before puck drop, PBE Cast and the Pro intelligence tier are how PropBetEdge reads hockey. All Access brings the same evidence-first intelligence to every sport in the network, plus PropBetEdge Predictions.' },
  sport_pro: { eyebrow: 'NHL · PRO MEMBER', title: 'Your NHL desk is <br><em>already unlocked.</em>', lede: 'All Access adds the other nine sport desks and PropBetEdge Predictions to the same membership. Nothing about your NHL desk changes.' },
  all_access: { eyebrow: 'PROPBETEDGE ALL ACCESS · PLATINUM MEMBER', title: 'Your network <br><em>is unlocked.</em>', lede: 'Every PropBetEdge desk is open on this account. Launch any product from here.' },
  owner: { eyebrow: 'PROPBETEDGE · VERIFIED OWNER', title: 'The full network <br><em>is unlocked.</em>', lede: 'Owner access is verified server-side. Every sport and PropBetEdge Predictions are open, with no subscription required.' },
  check: { eyebrow: 'PROPBETEDGE ALL ACCESS · ACCESS CHECK', title: 'Your access <br><em>is protected.</em>', lede: 'While verification is unavailable, nothing about your membership changes, and public NHL intelligence keeps working.' }
};

function includesHtml() {
  const sports = networkSports();
  const p = predictionsProduct();
  return `<div class="aap-incl">
    <div><span>SPORTS · ${sports.length}</span><ul>${sports.map(s => `<li${s.id === 'nhl' ? ' class="is-here"' : ''}>${esc(displaySport(s))}</li>`).join('')}</ul></div>
    ${p ? `<div class="is-intel"><span>INTELLIGENCE</span><b>◆ ${esc(p.label)}</b></div>` : ''}
  </div>`;
}

function launcherHtml(owner) {
  const p = predictionsProduct();
  return `<section class="aap-launch" aria-label="PropBetEdge network">
    <h2>${owner ? 'THE FULL NETWORK · UNLOCKED' : 'YOUR NETWORK · UNLOCKED'}</h2>
    <ul>${networkSports().map(s => s.id === 'nhl'
      ? `<li><span class="is-here" aria-current="page"><b>${esc(displaySport(s))}</b><em>YOU ARE HERE</em></span></li>`
      : `<li><a href="${esc(s.href)}" rel="noopener"><b>${esc(displaySport(s))}</b><em>OPEN →</em></a></li>`).join('')}</ul>
    ${p ? `<a class="aap-pred" href="${esc(p.href)}" rel="noopener"><span>INTELLIGENCE</span><b>◆ ${esc(p.label)}</b><em>OPEN →</em></a>` : ''}
  </section>`;
}

function panelHtml(view, m) {
  if (view === 'loading') {
    return `<div class="aap-panel-body"><span class="aap-eyebrow">PROPBETEDGE ALL ACCESS</span><h2 class="aap-head">Checking your NHL access…</h2><p class="aap-lede">${esc(OFFER_LINE)} · ${esc(PRICE)}.</p></div>`;
  }
  if (view === 'check') {
    return `<div class="aap-panel-body">
      <span class="aap-eyebrow">NHL · ACCESS CHECK</span>
      <h2 class="aap-head">Access check temporarily unavailable.</h2>
      <p class="aap-lede">We couldn't verify your membership right now. Nothing about it has changed, and every public NHL page keeps working.</p>
      <div class="aap-protect"><b>Your account is not being treated as unsubscribed.</b> Pricing and upgrade prompts stay hidden until verification answers cleanly.</div>
      <div class="aap-actions"><button type="button" class="aap-cta" data-aap-refresh>Retry verified access</button><button type="button" class="aap-btn" data-aap-signout>Sign out</button></div>
    </div>`;
  }
  if (view === 'all_access' || view === 'owner') {
    const owner = view === 'owner';
    return `<div class="aap-panel-body">
      <span class="aap-eyebrow is-member">${owner ? 'PROPBETEDGE · VERIFIED OWNER' : 'PROPBETEDGE ALL ACCESS · PLATINUM MEMBER'}</span>
      <h2 class="aap-head is-member">${owner ? 'Owner access is active.' : 'Your network<br>is unlocked.'}</h2>
      ${verifiedCardHtml(m)}
      ${launcherHtml(owner)}
      <div class="aap-actions">
        <a class="aap-cta" href="/#/pbe-picks">Open the hockey desk →</a>
        ${m.show_manage && !owner ? `<a class="aap-btn" href="${esc(MANAGE_URL)}" target="_blank" rel="noopener noreferrer">Manage membership ↗</a>` : ''}
        <button type="button" class="aap-btn" data-aap-refresh>Refresh verified access</button>
      </div>
      <p class="aap-secure is-member">◆ ${owner ? 'Verified owner · no checkout, no subscription required' : `Platinum Access Active · ${esc(PLATINUM_TRUTH)}`}</p>
    </div>`;
  }
  if (view === 'sport_pro') {
    const d = designation('sport_pro');
    return `<div class="aap-panel-body">
      <span class="aap-eyebrow is-member">${esc(d.eyebrow)}</span>
      <h2 class="aap-head is-member">Your NHL desk is<br>already unlocked.</h2>
      ${verifiedCardHtml(m)}
      <p class="aap-lede">Upgrade to PropBetEdge All Access to add the rest of the network to the same membership:</p>
      <ul class="aap-adds" aria-label="What All Access adds">${networkSports().filter(s => s.id !== 'nhl').map(s => `<li>+ ${esc(displaySport(s))}</li>`).join('')}<li class="is-intel">+ ◆ ${esc(predictionsProduct()?.label || 'PropBetEdge Predictions')}</li></ul>
      <div class="aap-actions">
        <a class="aap-cta" href="${esc(ALL_ACCESS_CHECKOUT_URL)}" rel="noopener" data-pbe-placement="all_access_upgrade" data-aap-cta="checkout">Upgrade to All Access · ${esc(PRICE)}</a>
        <a class="aap-btn" href="/#/pbe-picks">Open the hockey desk</a>
        ${m.show_manage ? `<a class="aap-btn" href="${esc(MANAGE_URL)}" target="_blank" rel="noopener noreferrer">Manage membership ↗</a>` : ''}
      </div>
      <p class="aap-secure">${promoHtml()} · NHL stays included</p>
    </div>`;
  }
  const ended = view === 'ended';
  return `<div class="aap-panel-body">
    <span class="aap-eyebrow">${ended ? 'NHL PRO · ACCESS ENDED' : 'PROPBETEDGE ALL ACCESS'}</span>
    <h2 class="aap-head">${ended ? 'NHL Pro access is no longer active.' : `${esc(OFFER_LINE)}.<br>One membership.`}</h2>
    ${ended ? '<p class="aap-lede">This browser\'s NHL Pro session ended because no active membership is attached to it. Renew NHL Pro, or take the whole network with All Access.</p>' : ''}
    <div class="aap-price"><b>${esc(PRICE.split('/')[0])}</b><span>/${esc(PRICE.split('/')[1] || 'month')}</span><small>${promoHtml()}</small></div>
    ${includesHtml()}
    <div class="aap-actions">
      <a class="aap-cta" href="${esc(ALL_ACCESS_CHECKOUT_URL)}" rel="noopener" data-pbe-placement="all_access_checkout" data-aap-cta="checkout">Get All Access</a>
      <button type="button" class="aap-btn" data-open-nhl-pro>${ended ? 'Renew NHL Pro' : 'Sign in'}</button>
      <button type="button" class="aap-btn" data-open-nhl-pro>${ended ? 'Sign in again' : 'Only want NHL? NHL Pro'}</button>
    </div>
    <p class="aap-secure">◆ Secure checkout by Stripe · ${esc(SECONDARY_LINE)}</p>
  </div>`;
}

function pageHtml() {
  const p = predictionsProduct();
  return `<div class="wrap aap">
    <div class="aap-shell">
      <div class="aap-story" id="aap-story">
        <ul class="aap-chips" aria-hidden="true"><li>10 SPORTS · ONE MEMBERSHIP</li><li>PREDICTIONS · INCLUDED</li><li>NHL · YOU ARE HERE</li></ul>
        <div class="aap-story-copy"><span class="aap-eyebrow" id="aap-story-eyebrow"></span><h1 class="aap-title" id="aap-story-title"></h1><p id="aap-story-lede"></p></div>
      </div>
      <div class="aap-panel" id="aap-panel" data-view="loading"></div>
    </div>
    <section class="aap-section" aria-labelledby="aap-network">
      <span class="aap-eyebrow">THE PROPBETEDGE NETWORK</span>
      <h2 id="aap-network">Ten sport desks. One intelligence product.</h2>
      <p class="aap-sub">Every desk is built for how its sport actually works. Features vary by sport, and each lists only what it actually ships.</p>
      <ul class="aap-grid">${networkSports().map(s => s.id === 'nhl'
        ? `<li class="is-here"><span aria-current="page"><b>${esc(displaySport(s))}</b><em>YOU ARE HERE</em></span></li>`
        : `<li><a href="${esc(s.href)}" rel="noopener"><b>${esc(displaySport(s))}</b><em>${esc(s.id === 'f1' ? 'PropBetEdge F1 Intelligence' : `PropBetEdge ${s.label}`)} →</em></a></li>`).join('')}</ul>
      ${p ? `<a class="aap-intel" href="${esc(p.href)}" rel="noopener"><span>INTELLIGENCE PRODUCT · NOT A SPORT</span><b>◆ ${esc(p.label)}</b><small>${esc(PREDICTIONS_BLURB)}</small></a>` : ''}
    </section>
    <section class="aap-section" aria-labelledby="aap-nhl">
      <span class="aap-eyebrow">THROUGH THE NHL LENS</span>
      <h2 id="aap-nhl">What the NHL desk brings to All Access.</h2>
      <div id="aap-caps"></div>
      <p class="aap-sub">Free for every reader, no account needed: ${esc(NHL_FREE_TOOLS.join(' · '))}. The first 16 official 2026-27 PBE Picks locks are permanently unpriced; market context is shown only where a pre-lock price exists.</p>
    </section>
  </div>`;
}

main.innerHTML = pageHtml();
for (const a of main.querySelectorAll('a[href^="#/"]')) a.setAttribute('href', `/${a.getAttribute('href')}`);

let painted = '';
function paint(account) {
  const m = accountMembership(account);
  const view = account === null ? 'signed_out' : accountView(account, m);
  const key = `${view}|${m.state}|${m.email || ''}`;
  if (key === painted) return;
  painted = key;
  const s = story[view] || story.prospect;
  const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
  set('aap-story-eyebrow', esc(s.eyebrow));
  set('aap-story-title', s.title);
  set('aap-story-lede', esc(s.lede));
  const panel = document.getElementById('aap-panel');
  panel.dataset.view = view;
  panel.innerHTML = panelHtml(view, m);
  document.getElementById('aap-story')?.setAttribute('data-view', view);
  const member = view === 'sport_pro' || view === 'all_access' || view === 'owner';
  set('aap-caps', capabilityGridHtml({ unlocked: member }));
  for (const a of panel.querySelectorAll('a[href^="#/"]')) a.setAttribute('href', `/${a.getAttribute('href')}`);
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-aap-refresh]')) { painted = ''; refreshAccount(); }
  if (event.target.closest('[data-aap-signout]')) signOut();
});

paint({ state: 'unknown' });
(async () => {
  // Same rule as the app: only ask who is signed in when sign-in exists here.
  const ready = await signInAvailable().catch(() => false);
  if (!ready) { paint(null); return; }
  onAccount(paint);
  refreshAccount();
})();
