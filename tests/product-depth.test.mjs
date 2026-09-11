import assert from 'node:assert/strict';
import fs from 'node:fs';

const player = fs.readFileSync('src/components/player.js', 'utf8');
const editorial = fs.readFileSync('src/services/editorial-depth.js', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const newsroom = fs.readFileSync('src/pages/news.js', 'utf8');
const watcher = fs.readFileSync('src/services/watcher.js', 'utf8');
const css = fs.readFileSync('src/styles/product-depth.css', 'utf8');

// Player photos: shared identity gets broad coverage without per-page hacks.
assert.match(player, /assets\.nhle\.com\/mugs\/nhl\/\$\{season\}\/\$\{club\}\/\$\{playerId\}\.png/, 'official NHL headshot candidates are derived from verified CDN shape');
assert.match(player, /propbet-img-proxy\.sales-fd3\.workers\.dev/, 'remote player imagery goes through the Cloudflare image proxy');
assert.match(player, /reviewed local portrait -> NHL asset-feed headshot -> branded/, 'reviewed portrait remains first priority');
assert.match(player, /has-official-photo/, 'official-photo styling hook exists');
assert.match(css, /\.pid__img--official/, 'official headshots have crop-safe styling');

// Editorial: first-party PBE NHL reporting is a separate presentation layer.
assert.match(editorial, /propbet-news-api\.sales-fd3\.workers\.dev/, 'PBE NHL originals come from the Cloudflare News API');
assert.match(editorial, /\/news\/by-sport\/nhl\?limit=/, 'only the NHL first-party stream is requested');
assert.match(editorial, /credentials: 'omit'/, 'editorial request carries no browser credential');
assert.match(editorial, /PropBetEdge NHL · Original reporting/, 'PBE originals are visibly branded as first-party');
assert.match(editorial, /Verified source wire/, 'source wire is kept visibly separate');
assert.match(editorial, /PBE NHL Dispatch/, 'Ice Board receives a first-party editorial rail');
assert.match(editorial, /PBE Originals/, 'the formerly empty PBE tab becomes the originals desk');

// Operational truth remains on the existing NHL newsroom adapter. Editorial is
// not allowed to become the injury/goalie/transaction source of record.
assert.match(newsroom, /from '\.\.\/lib\/api\.js'/, 'Newsroom still uses the NHL API adapter');
assert.match(newsroom, /news\(\{ limit: 100 \}/, 'source wire remains live on Newsroom');
assert.match(watcher, /news\(\{ limit: 60 \}/, 'watcher still consumes verified source wire');

assert.match(main, /styles\/product-depth\.css/, 'product-depth CSS is loaded');
assert.match(main, /services\/editorial-depth\.js/, 'first-party editorial layer is booted');
assert.ok(!/Math\.random\s*\(/.test(editorial), 'editorial layer contains no synthetic/random data');
assert.ok(!/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(editorial), 'editorial layer contains no frontend secret contract');

console.log('NHL product depth: PASS — photos + PBE-first editorial + source-wire separation');
