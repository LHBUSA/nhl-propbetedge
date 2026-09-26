import { PBE_NETWORK } from '../lib/network.js';
import { ALL_ACCESS_URL } from '../lib/pbe-membership.js';

const currentYear = new Date().getFullYear();

function sportLink(sport, className = 'network-sport') {
  const current = sport.current ? ' aria-current="page"' : '';
  const live = sport.status === 'LIVE' ? '<span class="network-live"><i></i> LIVE</span>' : '';
  return `<a class="${className}${sport.current ? ' is-current' : ''}" href="${sport.href}"${current}>
    <span class="network-sport__icon" aria-hidden="true">${sport.icon}</span>
    <span class="network-sport__copy"><b>${sport.label}</b>${live}</span>
    <span class="network-sport__arrow" aria-hidden="true">↗</span>
  </a>`;
}

function mobileNetwork() {
  return `<section class="sheet-network" aria-labelledby="sheet-network-title">
    <div class="sheet-network__head">
      <span class="eyebrow" id="sheet-network-title">PropBetEdge Network</span>
      <a href="${PBE_NETWORK.hub}">Hub ↗</a>
    </div>
    <div class="sheet-network__sports">
      ${PBE_NETWORK.sports.map(sport => sportLink(sport, 'sheet-network__sport')).join('')}
    </div>
    <div class="sheet-network__links">
      <a href="${PBE_NETWORK.news}">Sports News ↗</a>
      <a href="${PBE_NETWORK.learn}">Learn ↗</a>
      <a href="${PBE_NETWORK.store}">Store ↗</a>
      <a href="${PBE_NETWORK.discord}" target="_blank" rel="noopener">Discord ↗</a>
    </div>
  </section>`;
}

function premiumFooter() {
  const productLinks = [
    ['Ice Board', '#/'],
    ['PBE Cast', '#/cast'],
    ['Props', '#/props'],
    ['Goalies', '#/goalies'],
    ['Lines', '#/lines'],
    ['Injuries', '#/injuries'],
    ['Shot Lab', '#/shots'],
    ['Standings', '#/standings']
  ];
  const trustLinks = [
    ['Methodology & data truth', '#/methodology'],
    ['Track record', '#/track-record'],
    ['Image credits', '#/methodology?section=credits']
  ];

  return `
    <div class="footer-premium__glow" aria-hidden="true"></div>
    <div class="wrap footer-premium">
      <div class="footer-premium__hero">
        <div class="footer-premium__brand-block">
          <a class="brand brand--footer" href="#/" aria-label="PropBetEdge NHL home">
            <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 512 512" width="42" height="42"><rect width="512" height="512" rx="104" fill="#14110d"/><rect x="12" y="12" width="488" height="488" rx="94" fill="none" stroke="#d4af37" stroke-opacity=".55" stroke-width="16"/><g transform="translate(260 256) scale(0.86) skewX(-7) translate(-256 -256)"><path fill="#e8c452" fill-rule="evenodd" d="M214 82 Q214 72 224 72 H330 A122 122 0 0 1 330 316 H318 V352 A88 88 0 0 1 230 440 H92 Q52 440 52 406 Q52 372 92 368 L190 364 Q214 362 214 336 Z M318 142 H328 A52 52 0 0 1 328 246 H318 Z"/></g></svg></span>
            <span><span class="brand__word">PropBet<b>Edge</b></span><span class="footer-premium__product">NHL</span></span>
          </a>
          <h2>Hockey intelligence built to explain what changed.</h2>
          <p>Live game context, goalie status, line deployment, shot pressure, props and market movement — sourced, time-stamped and designed for fast decisions.</p>
          <div class="footer-premium__quick">
            <a href="#/">Open Ice Board <span>→</span></a>
            <a href="#/cast">Open PBE Cast <span>→</span></a>
            <a href="#/methodology">How the data works <span>→</span></a>
          </div>
        </div>

        <aside class="footer-premium__network-card" aria-label="PropBetEdge sports network">
          <div class="footer-premium__network-head">
            <div><span class="micro">PROPBETEDGE NETWORK</span><strong>Pick your sport.</strong></div>
            <a href="${PBE_NETWORK.hub}">All products ↗</a>
          </div>
          <div class="footer-premium__sports">
            ${PBE_NETWORK.sports.map(sport => sportLink(sport)).join('')}
          </div>
        </aside>
      </div>

      <div class="footer-premium__grid">
        <section>
          <span class="footer-premium__label">NHL PRODUCT</span>
          <div class="footer-premium__link-grid">
            ${productLinks.map(([label, href]) => `<a href="${href}">${label}<span>→</span></a>`).join('')}
          </div>
        </section>
        <section>
          <span class="footer-premium__label">EXPLORE PBE</span>
          <div class="footer-premium__links">
            <a class="footer-premium__aa" href="${ALL_ACCESS_URL}" rel="noopener" data-pbe-footer-all-access>ALL ACCESS <span>↗</span></a>
            <a class="footer-premium__aa" href="${ALL_ACCESS_URL}" rel="noopener" data-pbe-footer-all-access-included>WHAT'S INCLUDED <span>↗</span></a>
            <a href="${PBE_NETWORK.news}">Sports News <span>↗</span></a>
            <a href="${PBE_NETWORK.learn}">Learn PropBetEdge <span>↗</span></a>
            <a href="${PBE_NETWORK.store}">PBE Store <span>↗</span></a>
            <a href="https://billing.stripe.com/p/login/cNi3cv2vY7em3lr4oj7wA00" target="_blank" rel="noopener noreferrer">Manage billing <span>↗</span></a>
            <a href="mailto:sales@proptechusa.ai">Contact us <span>→</span></a>
            <a href="${PBE_NETWORK.discord}" target="_blank" rel="noopener">Discord Community <span>↗</span></a>
            <a class="pbe-x-link" href="${PBE_NETWORK.x}" target="_blank" rel="noopener noreferrer" aria-label="Follow PropBetEdge on X (${PBE_NETWORK.xHandle})" title="Follow PropBetEdge on X"><span aria-hidden="true">𝕏</span> ${PBE_NETWORK.xHandle}</a>
          </div>
        </section>
        <section>
          <span class="footer-premium__label">DATA & TRUST</span>
          <p class="footer-premium__source">Game, play-by-play and player data is sourced from the NHL through PropSports infrastructure. Volatile panels expose source and age rather than pretending stale data is live.</p>
          <div class="footer-premium__links footer-premium__links--compact">
            ${trustLinks.map(([label, href]) => `<a href="${href}">${label}<span>→</span></a>`).join('')}
          </div>
        </section>
      </div>

      <div class="footer-premium__legal">
        <div>
          <b>Research tooling, not a guarantee.</b>
          <span>21+ · Please gamble responsibly · If you or someone you know has a gambling problem, call 1-800-GAMBLER.</span>
        </div>
        <div class="footer-premium__legal-links">
          <a href="${PBE_NETWORK.hub}">PropBetEdge.ai ↗</a>
          <span>© ${currentYear} PropBetEdge</span>
        </div>
      </div>
    </div>`;
}

export function upgradeChrome() {
  // Desktop stays product-first: the cross-sport network selector no longer
  // competes with NHL navigation for header space. Network discovery remains
  // fully available in the mobile sheet and premium footer.
  const sheetSearch = document.querySelector('.sheet__search');
  if (sheetSearch && !document.querySelector('.sheet-network')) {
    sheetSearch.insertAdjacentHTML('afterend', mobileNetwork());
  }

  const footer = document.querySelector('.footer');
  if (footer && !footer.classList.contains('footer--premium')) {
    footer.classList.add('footer--premium');
    footer.innerHTML = premiumFooter();
  }
}
