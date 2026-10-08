// Kalshi PERPETUALS partner offer (contract kalshi-partner/2) — ONE footer module per page.
// A commercial partner block in the network footer only: never in picks, game, prop, PBE Cast
// or Kalshi market components, and never a model input. Copy, economics and the link all come
// from the vendored canonical client; config is read through the same-origin rewrite
// /go/kalshi-perps/config (vercel.json). Disabled / failed config renders nothing (fail closed).
import { loadPartnerConfig, partnerOffer } from '../vendor/kalshi/kalshi-partner.js';
import '../styles/kalshi-partner.css';

export const PARTNER_CONFIG_URL = '/go/kalshi-perps/config';
export const PARTNER_CTX = Object.freeze({ placement: 'sport_footer', product: 'nhl', sport: 'nhl' });

export function mountKalshiPartnerFooter(doc = document) {
  const slot = doc.querySelector('#nhl-kxo');
  if (!slot || slot.dataset.kxoMounted) return Promise.resolve(false);
  slot.dataset.kxoMounted = '1';
  return loadPartnerConfig(PARTNER_CONFIG_URL)
    .then(cfg => {
      if (doc.querySelector('.kxo')) return false; // exactly one offer per page
      const html = partnerOffer(cfg, PARTNER_CTX, { variant: 'footer' });
      if (!html) return false;
      slot.innerHTML = html;
      slot.hidden = false;
      return true;
    })
    .catch(() => false);
}
