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

// Editorial: the public feed is filtered to the PBE-authored analysis subset.
assert.match(editorial, /propbet-news-api\.sales-fd3\.workers\.dev/, 'PBE NHL analysis comes from the owned Cloudflare News API');
assert.match(editorial, /\/news\/by-sport\/nhl\?limit=\$\{FETCH_LIMIT\}&page=1/, 'only the NHL channel is requested');
assert.match(editorial, /function isPbeAnalysis\(article\)/, 'PBE-analysis discriminator is explicit');
assert.match(editorial, /author && body\.length >= 500 && source && sourceUrl && title && slug/, 'raw source-wire rows cannot masquerade as PBE analysis');
assert.match(editorial, /credentials: 'omit'/, 'editorial request carries no browser credential');
assert.match(editorial, /PropBetEdge NHL Desk · PBE analysis/, 'PBE analysis is visibly first-party branded');
assert.match(editorial, /PBE analysis based on attributed reporting/, 'underlying reporting provenance stays visible');
assert.match(editorial, /Source: \$\{esc\(article\.source_label\)\}/, 'every PBE card keeps an attributed source link');
assert.match(editorial, /Verified source wire/, 'source wire is kept visibly separate');
assert.match(editorial, /PBE NHL Dispatch/, 'Ice Board receives a PBE editorial rail');
assert.match(editorial, /PBE NHL\$\{state\.items\.length/, 'the formerly empty PBE tab becomes the PBE desk');

// Known-risk generic fields must not be rendered into the NHL vertical. The
// upstream source audit specifically flags copied/derivative summaries,
// third-party article images and generated bet advice.
assert.ok(!/article\.summary/.test(editorial), 'upstream summary is not rendered');
assert.ok(!/article\.image_url/.test(editorial), 'third-party article image is not rendered');
assert.ok(!/take\?\.summary|take\.summary/.test(editorial), 'generated take summary is not rendered');
assert.ok(!/bet_advice/.test(editorial), 'generated betting advice is not rendered');

// Operational truth remains on the existing NHL newsroom adapter. Editorial is
// not allowed to become the injury/goalie/transaction source of record.
assert.match(newsroom, /from '\.\.\/lib\/api\.js'/, 'Newsroom still uses the NHL API adapter');
assert.match(newsroom, /news\(\{ limit: 100 \}/, 'source wire remains live on Newsroom');
assert.match(watcher, /news\(\{ limit: 60 \}/, 'watcher still consumes verified source wire');

assert.match(main, /styles\/product-depth\.css/, 'product-depth CSS is loaded');
assert.match(main, /services\/editorial-depth\.js/, 'PBE editorial layer is booted');
assert.ok(!/Math\.random\s*\(/.test(editorial), 'editorial layer contains no synthetic/random data');
assert.ok(!/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(editorial), 'editorial layer contains no frontend secret contract');

console.log('NHL product depth: PASS — photos + PBE-first analysis + attributed source-wire separation');
