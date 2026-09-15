import { esc } from '../lib/dom.js';
import { confirmSignIn, signInAvailable } from '../lib/account.js';

// #/auth/verify?token=… — the emailed one-time link lands here. The token is in
// the URL fragment, so opening the link sends it to no server. It is removed
// from the address bar immediately and spent only when the reader clicks, so a
// mail scanner that pre-opens links cannot consume it.

const ERRORS = {
  expired: ['This sign-in link has expired or was already used.', 'Links work once and expire after 15 minutes. Request a fresh one.'],
  not_authorized: ['No active NHL Pro subscription for this email.', 'Sign in with the same email you used at checkout. If your plan ended, renew to continue.'],
  unavailable: ['Sign-in is temporarily unavailable.', 'Nothing was changed. Try the link again in a minute, or request a new one.']
};

export function mount(root, params) {
  const token = typeof params.token === 'string' ? params.token : '';
  if (token) history.replaceState(null, '', `${location.pathname}#/auth/verify`);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);

  root.innerHTML = `<section class="wrap section auth-verify">
    <div class="auth-card pbe-panel">
      <span class="eyebrow">NHL Pro · Secure sign-in</span>
      <h2 class="auth-card__title">${valid ? 'Confirm your sign-in' : 'Open the link from your email'}</h2>
      <p class="auth-card__copy">${valid
        ? 'This finishes signing in on this browser. The link works once.'
        : 'This page needs the one-time link from your NHL Pro sign-in email.'}</p>
      ${valid ? '<button type="button" class="pbe-btn pbe-btn--primary auth-card__cta" data-confirm>Sign in to NHL Pro</button>' : '<button type="button" class="pbe-btn pbe-btn--primary auth-card__cta" data-open-nhl-pro>Request a sign-in link</button>'}
      <p class="auth-card__msg" role="status" aria-live="polite" data-msg></p>
    </div>
  </section>`;

  const button = root.querySelector('[data-confirm]');
  const msg = root.querySelector('[data-msg]');
  let alive = true;
  button?.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Signing in…';
    if (!(await signInAvailable())) {
      if (!alive) return;
      msg.textContent = ERRORS.unavailable[0];
      button.textContent = 'Sign in to NHL Pro';
      button.disabled = false;
      return;
    }
    const result = await confirmSignIn(token);
    if (!alive) return;
    if (result.ok) {
      location.hash = '#/pbe-picks';
      return;
    }
    const [title, copy] = ERRORS[result.error] || ERRORS.unavailable;
    root.querySelector('.auth-card__title').textContent = title;
    root.querySelector('.auth-card__copy').textContent = copy;
    button.remove();
    msg.innerHTML = `<button type="button" class="pbe-btn pbe-btn--ghost" data-open-nhl-pro>${esc('Request a new link')}</button>`;
  });
  return () => { alive = false; };
}
