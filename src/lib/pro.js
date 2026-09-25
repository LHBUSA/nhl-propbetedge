import '../styles/pro.css';
import { onAccount, refreshAccount, requestSignIn, signInAvailable, signOut } from './account.js';
import { accountMembership, freeOfferHtml, isMember, memberPanelHtml, planCardsHtml, proButtonHtml, proButtonLabel } from './pro-membership-ui.js';

/**
 * PropBetEdge NHL Pro — purchase + membership surface.
 *
 * Vercel serves this frontend. NHL Pro checkout is OPEN: All Access (primary)
 * and the NHL-only monthly/weekly payment links (secondary) are live, the
 * entitlement path passed its production canaries (propsports-api-worker
 * docs/receipts/2026-09-15-nhl-pro-plumbing.json) and sign-in email is
 * configured. OPEN_FOR_PURCHASE stays as a kill switch. The PropBetEdge All
 * Access checkout (shared contract) is live and is the
 * PRIMARY offer: FREE readers see the All Access hero first, then the
 * "ONLY WANT NHL?" seam, then the NHL cards (lib/all-access-hero.js renders
 * the hero in NHL's own visual identity). Members see the shared membership
 * panel (NHL PRO ACTIVE / ALL ACCESS ACTIVE / OWNER); NHL PRO ACTIVE gets the
 * UPGRADE TO ALL ACCESS hero and, for All Access and owner, there is no
 * purchase CTA anywhere. Membership state comes only from the gateway
 * (lib/account.js); localStorage remembers plan preference only and never
 * grants Pro access.
 *
 * Geometry rule (styles/pro.css): the dialog never scrolls internally.
 */
const OPEN_FOR_PURCHASE = true;
const STORAGE_KEY = 'pbe_nhl_founding_plan_v1';

export const NHL_PRO_PLANS = Object.freeze({
  monthly: {
    label: 'Monthly',
    badge: 'Popular',
    price: '$9.99',
    cadence: '/ month',
    detail: 'Founding Season rate · Renews monthly · Cancel anytime',
    paymentLinkId: 'plink_1UEWmLF3CaVzg4ORwxmpwjSz',
    url: 'https://buy.stripe.com/14AbJ13A2fKS3lr8Ez7wA0B'
  },
  weekly: {
    label: 'Weekly',
    badge: 'Flexible',
    price: '$3.99',
    cadence: '/ week',
    detail: 'Founding Season rate · Renews weekly · Cancel anytime',
    paymentLinkId: 'plink_1UEWmSF3CaVzg4ORdWk3Yqcj',
    url: 'https://buy.stripe.com/6oUfZh6MegOW9JP4oj7wA0C'
  }
});

const FEATURES = [
  ['PBE Cast', 'Follow the game with live hockey context instead of a generic scoreboard.'],
  ['Best Line + market context', 'See the best available number, consensus and movement without pretending market price is model edge.'],
  ['Goalies + lines', 'Starting-goalie state, deployment and line context connected to the same research workflow.'],
  ['Shot Lab + track record', 'Research pressure and shot quality, then verify what PropBetEdge actually issued and graded.']
];

let selected = loadPlan();
let previousFocus = null;

function loadPlan() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return NHL_PRO_PLANS[value] ? value : 'monthly';
  } catch (_) {
    return 'monthly';
  }
}

function savePlan(key) {
  selected = NHL_PRO_PLANS[key] ? key : 'monthly';
  try { localStorage.setItem(STORAGE_KEY, selected); } catch (_) {}
  paintSelection();
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value) && value.length <= 254;
}

function checkoutUrl(plan, email) {
  const url = new URL(plan.url);
  url.searchParams.set('locked_prefilled_email', email);
  return url.toString();
}

function markup() {
  return `
    <div class="pbepro" id="nhl-pro-modal" hidden>
      <div class="pbepro__scrim" data-pro-close></div>
      <section class="pbepro__dialog" role="dialog" aria-modal="true" aria-labelledby="nhl-pro-title">
        <button class="pbepro__close" type="button" data-pro-close aria-label="Close NHL Pro">×</button>
        <div class="pbepro__story">
          <div class="pbepro__eyebrow">PROPBETEDGE · NHL PRO · LIVE NOW</div>
          <h2 id="nhl-pro-title">See the market.<br><em>Own the ice.</em></h2>
          <p class="pbepro__lede">The full PropBetEdge hockey intelligence layer at introductory pricing. Built for bettors who want to know what changed and why the number matters.</p>
          <div class="pbepro__features">
            ${FEATURES.map(([title, copy], i) => `<article class="pbepro__feature"><span>0${i + 1}</span><div><strong>${title}</strong><p>${copy}</p></div></article>`).join('')}
          </div>
          <div class="pbepro__truth pbepro__purchase-only">No free trial. No fake urgency. Cancel anytime.</div>
        </div>
        <div class="pbepro__purchase">
          <div class="pbepro__offer pbepro__purchase-only" id="nhl-pro-all-access">${freeOfferHtml(accountMembership(null))}</div>
          <div class="pbepro__purchase-head pbepro__purchase-only">
            <span>FOUNDING SEASON PRICING</span>
            <strong>NHL Pro on its own</strong>
            <p>Monthly is selected by default. Cancel anytime.</p>
          </div>
          <div class="pbepro__plans pbepro__purchase-only" role="radiogroup" aria-label="NHL Pro plans">
            ${planCardsHtml(NHL_PRO_PLANS)}
          </div>
          <label class="pbepro__email pbepro__purchase-only" id="nhl-pro-email-label"${OPEN_FOR_PURCHASE ? '' : ' hidden'}>
            <span>Access email</span>
            <small>This email will become your NHL Pro identity.</small>
            <input id="nhl-pro-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" />
          </label>
          <button class="pbepro__cta pbepro__purchase-only" id="nhl-pro-checkout" type="button"></button>
          <div class="pbepro__message" id="nhl-pro-message" aria-live="polite"></div>
          <div class="pbepro__secure pbepro__purchase-only">◆ Access controlled by PropBetEdge</div>
          <div class="pbepro__note" id="nhl-pro-signin-unavailable" hidden>
            <span>ACCOUNT SIGN-IN</span>
            <p>Member sign-in is not available yet. Everything above is what NHL Pro includes; nothing is charged and no account is created here today.</p>
          </div>
          <div class="pbepro__signin" id="nhl-pro-signin" hidden>
            <div class="pbepro__signin-head"><span>ALREADY NHL PRO?</span><p>Sign in with the email you used at checkout. We email a one-time link.</p></div>
            <form class="pbepro__signin-form" id="nhl-pro-signin-form" novalidate>
              <input id="nhl-pro-signin-email" type="email" autocomplete="email" inputmode="email" placeholder="checkout email" aria-label="Checkout email" />
              <button type="submit" class="pbepro__signin-btn">Email me a link</button>
            </form>
            <div class="pbepro__message" id="nhl-pro-signin-message" aria-live="polite"></div>
          </div>
          <div class="pbepro__account" id="nhl-pro-account" hidden></div>
        </div>
      </section>
    </div>`;
}

function paintSelection() {
  const root = document.getElementById('nhl-pro-modal');
  if (!root) return;
  root.querySelectorAll('[data-pro-plan]').forEach(button => {
    const on = button.dataset.proPlan === selected;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-checked', String(on));
    const select = button.querySelector('.pbepro__select');
    if (select) select.textContent = on ? 'Selected' : `Choose ${NHL_PRO_PLANS[button.dataset.proPlan].label.toLowerCase()}`;
  });
  const plan = NHL_PRO_PLANS[selected];
  const cta = document.getElementById('nhl-pro-checkout');
  // Kill switch (OPEN_FOR_PURCHASE false): the CTA states the truth, points to
  // All Access (which includes NHL Pro), and cannot be actioned.
  if (cta && !OPEN_FOR_PURCHASE) {
    cta.disabled = true;
    cta.setAttribute('aria-disabled', 'true');
  }
  if (cta) cta.textContent = OPEN_FOR_PURCHASE
    ? `Continue to checkout · ${plan.price}${selected === 'monthly' ? '/mo' : '/wk'}`
    : 'Get NHL Pro with All Access above';
}

function message(text, tone = '') {
  const el = document.getElementById('nhl-pro-message');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function open() {
  const root = document.getElementById('nhl-pro-modal');
  if (!root) return;
  previousFocus = document.activeElement;
  root.hidden = false;
  document.documentElement.classList.add('pbepro-lock');
  paintSelection();
  requestAnimationFrame(() => root.querySelector('.pbepro__close')?.focus());
}

function close() {
  const root = document.getElementById('nhl-pro-modal');
  if (!root || root.hidden) return;
  root.hidden = true;
  document.documentElement.classList.remove('pbepro-lock');
  previousFocus?.focus?.();
}

function startCheckout() {
  const email = String(document.getElementById('nhl-pro-email')?.value || '').trim().toLowerCase();
  if (!validEmail(email)) return message('Enter the email you want tied to NHL Pro.', 'error');
  if (!OPEN_FOR_PURCHASE) {
    return message('All Access above includes NHL Pro. Nothing was charged.', 'hold');
  }
  window.location.assign(checkoutUrl(NHL_PRO_PLANS[selected], email));
}

// Paints the surface for the gateway-decided account. Members (any of
// sport_pro / all_access / owner) see the shared membership panel and none of
// the NHL purchase controls; FREE readers keep the All Access hero + NHL cards.
function renderAccount(account) {
  const button = document.querySelector('[data-open-nhl-pro].pbepro__open');
  const pro = isMember(account);
  const m = accountMembership(account);
  if (button) {
    button.classList.toggle('is-pro', pro);
    const html = proButtonHtml(account);
    if (button.innerHTML !== html) button.innerHTML = html;
    button.setAttribute('aria-label', proButtonLabel(account, true));
  }
  const root = document.getElementById('nhl-pro-modal');
  if (root) root.dataset.membership = m.state;
  const panel = document.getElementById('nhl-pro-account');
  if (panel) {
    panel.hidden = !pro;
    panel.innerHTML = pro ? memberPanelHtml(m) : '';
  }
  const offer = document.getElementById('nhl-pro-all-access');
  if (offer) offer.innerHTML = freeOfferHtml(m);
  const signin = document.getElementById('nhl-pro-signin');
  if (signin && pro) signin.hidden = true;
  const note = document.getElementById('nhl-pro-signin-unavailable');
  if (note && pro) note.hidden = true;
}

async function wireAccount() {
  onAccount(renderAccount);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-pro-signout]')) signOut();
  });
  const available = await signInAvailable().catch(() => false);
  if (!available) {
    // Say so, rather than leaving the reader guessing at a missing form. The
    // explainer above is the real content; no dead sign-in action is rendered.
    const note = document.getElementById('nhl-pro-signin-unavailable');
    if (note) note.hidden = false;
    return;
  }
  const signin = document.getElementById('nhl-pro-signin');
  if (signin) signin.hidden = false;
  document.getElementById('nhl-pro-signin-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('nhl-pro-signin-email');
    const out = document.getElementById('nhl-pro-signin-message');
    const email = String(input?.value || '').trim().toLowerCase();
    if (!validEmail(email)) { out.textContent = 'Enter the email you used at checkout.'; out.dataset.tone = 'error'; return; }
    out.textContent = 'Sending…'; out.dataset.tone = '';
    const result = await requestSignIn(email);
    out.textContent = result.message;
    out.dataset.tone = result.ok ? 'success' : 'error';
  });
  refreshAccount();
}

function install() {
  if (document.getElementById('nhl-pro-modal')) return;
  document.body.insertAdjacentHTML('beforeend', markup());

  // The shell renders the NHL Pro control itself so chrome can decide whether
  // it should exist at all (see bindProButton in components/shell.js). Only
  // create one here if the shell did not.
  const tools = document.querySelector('.topbar__tools');
  if (tools && !tools.querySelector('[data-open-nhl-pro]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pbepro__open';
    button.dataset.openNhlPro = '';
    button.innerHTML = '<span>NHL</span> PRO';
    button.setAttribute('aria-label', 'See what NHL Pro includes');
    tools.prepend(button);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-nhl-pro]')) open();
    if (event.target.closest('[data-pro-close]')) close();
    const plan = event.target.closest('[data-pro-plan]');
    if (plan) savePlan(plan.dataset.proPlan);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  document.getElementById('nhl-pro-checkout')?.addEventListener('click', startCheckout);
  document.getElementById('nhl-pro-email')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') startCheckout();
  });
  paintSelection();

  if (new URLSearchParams(location.search).get('checkout') === 'success') {
    // Success is informational only. Query params never grant entitlement.
    open();
    message('Payment received. Sign in below with the same email you used at checkout — access appears once your subscription is confirmed.', 'success');
  }

  wireAccount();

  window.PBENHLPro = { open, close, plans: NHL_PRO_PLANS, purchaseOpen: OPEN_FOR_PURCHASE };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
