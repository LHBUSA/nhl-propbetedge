import '../styles/pro.css';
import { onAccount, refreshAccount, requestSignIn, signInAvailable, signOut } from './account.js';

/**
 * PropBetEdge NHL Pro — Founding Season purchase UI.
 *
 * Vercel serves this frontend. Billing + entitlement remains closed until the
 * Cloudflare -> Supabase multi-sport entitlement path passes production gates.
 * localStorage remembers plan preference only; it never grants Pro access.
 */
const OPEN_FOR_PURCHASE = false;
const STORAGE_KEY = 'pbe_nhl_founding_plan_v1';

export const NHL_PRO_PLANS = Object.freeze({
  monthly: {
    label: 'Monthly',
    badge: 'Best value',
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
          <div class="pbepro__eyebrow">FOUNDING SEASON · NHL PRO</div>
          <h2 id="nhl-pro-title">See the market.<br><em>Own the ice.</em></h2>
          <p class="pbepro__lede">The full PropBetEdge hockey intelligence layer at introductory pricing. Built for bettors who want to know what changed and why the number matters.</p>
          <div class="pbepro__features">
            ${FEATURES.map(([title, copy], i) => `<article class="pbepro__feature"><span>0${i + 1}</span><div><strong>${title}</strong><p>${copy}</p></div></article>`).join('')}
          </div>
          <div class="pbepro__truth">No free trial. No fake urgency. Cancel anytime.</div>
        </div>
        <div class="pbepro__purchase">
          <div class="pbepro__purchase-head">
            <span>FOUNDING SEASON PRICING</span>
            <strong>Choose NHL Pro</strong>
            <p>Monthly is the best value and is selected by default.</p>
          </div>
          <div class="pbepro__plans" role="radiogroup" aria-label="NHL Pro plans">
            ${Object.entries(NHL_PRO_PLANS).map(([key, plan]) => `
              <button type="button" class="pbepro__plan" data-pro-plan="${key}" role="radio" aria-checked="false">
                <div class="pbepro__plan-top"><span>${plan.label}</span><b>${plan.badge}</b></div>
                <div class="pbepro__price"><strong>${plan.price}</strong><span>${plan.cadence}</span></div>
                <small>${plan.detail}</small>
                <div class="pbepro__select">Choose ${plan.label.toLowerCase()}</div>
              </button>`).join('')}
          </div>
          <label class="pbepro__email">
            <span>Access email</span>
            <small>This email will become your NHL Pro identity.</small>
            <input id="nhl-pro-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" />
          </label>
          <button class="pbepro__cta" id="nhl-pro-checkout" type="button"></button>
          <div class="pbepro__charge">Charged today · No free trial · Cancel anytime</div>
          <div class="pbepro__message" id="nhl-pro-message" aria-live="polite"></div>
          <div class="pbepro__secure">◆ Secure checkout by Stripe · Access controlled by PropBetEdge</div>
          <div class="pbepro__signin" id="nhl-pro-signin" hidden>
            <div class="pbepro__signin-head"><span>ALREADY NHL PRO?</span><p>Sign in with the email you used at checkout. We email a one-time link.</p></div>
            <form class="pbepro__signin-form" id="nhl-pro-signin-form" novalidate>
              <input id="nhl-pro-signin-email" type="email" autocomplete="email" inputmode="email" placeholder="checkout email" aria-label="Checkout email" />
              <button type="submit" class="pbepro__signin-btn">Email me a link</button>
            </form>
            <div class="pbepro__message" id="nhl-pro-signin-message" aria-live="polite"></div>
          </div>
          <div class="pbepro__account" id="nhl-pro-account" hidden>
            <span>NHL PRO · ACTIVE</span>
            <strong id="nhl-pro-account-email"></strong>
            <p id="nhl-pro-account-plan"></p>
            <button type="button" class="pbepro__signout" data-pro-signout>Sign out</button>
          </div>
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
  if (cta) cta.textContent = OPEN_FOR_PURCHASE
    ? `Continue to Stripe · ${plan.price}${selected === 'monthly' ? '/mo' : '/wk'}`
    : 'Founding Season checkout coming online';
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
    return message('NHL Pro pricing is locked. Checkout opens after the entitlement security cutover passes.', 'hold');
  }
  window.location.assign(checkoutUrl(NHL_PRO_PLANS[selected], email));
}

function renderAccount(account) {
  const button = document.querySelector('[data-open-nhl-pro].pbepro__open');
  const pro = account.state === 'pro';
  if (button) {
    button.classList.toggle('is-pro', pro);
    button.innerHTML = pro ? '<span>NHL</span> PRO ✓' : '<span>NHL</span> PRO';
    button.setAttribute('aria-label', pro ? 'NHL Pro account' : 'Open NHL Pro Founding Season pricing');
  }
  const panel = document.getElementById('nhl-pro-account');
  if (panel) {
    panel.hidden = !pro;
    if (pro) {
      document.getElementById('nhl-pro-account-email').textContent = account.email || '';
      const s = account.subscription || {};
      const end = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      document.getElementById('nhl-pro-account-plan').textContent = s.plan
        ? `${s.plan === 'weekly' ? 'Weekly' : 'Monthly'} · ${s.cancel_at_period_end ? `ends ${end}` : `renews ${end}`}`
        : '';
    }
  }
  const signin = document.getElementById('nhl-pro-signin');
  if (signin && pro) signin.hidden = true;
}

async function wireAccount() {
  onAccount(renderAccount);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-pro-signout]')) signOut();
  });
  if (!(await signInAvailable())) return; // auth not live in this environment
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
    button.setAttribute('aria-label', 'Open NHL Pro Founding Season pricing');
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
    message('Payment received. Sign in below with the same email you used at checkout — access appears once Stripe confirms your subscription.', 'success');
  }

  wireAccount();

  window.PBENHLPro = { open, close, plans: NHL_PRO_PLANS, purchaseOpen: OPEN_FOR_PURCHASE };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
