import assert from 'node:assert/strict';
import fs from 'node:fs';

const player = fs.readFileSync('src/components/player.js', 'utf8');
const editorial = fs.readFileSync('src/services/editorial-depth.js', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const newsroom = fs.readFileSync('src/pages/news.js', 'utf8');
const watcher = fs.readFileSync('src/services/watcher.js', 'utf8');
const css = fs.readFileSync('src/styles/product-depth.css', 'utf8');
const contextCss = fs.readFileSync('src/styles/contextual-intel.css', 'utf8');

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
assert.match(editorial, /function destinationPublishes\(article\)/, 'NHL cards use the destination article publication gate');
assert.match(editorial, /matches\.length === 0\) return false/, 'title/body mismatches are withheld before a broken article link can render');
assert.match(editorial, /author === 'donneal green'/, 'retired-author rows are withheld consistently with the destination site');
assert.match(editorial, /Page Not Found/, 'the link-safety reason is documented beside the gate');
assert.match(editorial, /credentials: 'omit'/, 'editorial request carries no browser credential');
assert.match(editorial, /PropBetEdge NHL Desk · PBE analysis/, 'PBE analysis is visibly first-party branded');
assert.match(editorial, /PBE analysis based on attributed reporting/, 'underlying reporting provenance stays visible');
assert.match(editorial, /Source: \$\{esc\(article\.source_label\)\}/, 'every PBE card keeps an attributed source link');
assert.match(editorial, /Verified source wire/, 'source wire is kept visibly separate');
assert.match(editorial, /PBE NHL Dispatch/, 'Ice Board receives a PBE editorial rail');
assert.match(editorial, /PBE NHL\$\{state\.items\.length/, 'the formerly empty PBE tab becomes the PBE desk');

// Contextual research: one editorial fetch/store now serves team + player pages.
assert.match(editorial, /const players = Array\.isArray\(article\?\.take\?\.players\)/, 'PBE player tags survive normalization for research matching');
assert.match(editorial, /function currentResearchContext\(\)/, 'team/player route context is explicit');
assert.match(editorial, /function researchMatches\(ctx\)/, 'context matching is centralized');
assert.match(editorial, /article\.teams\.includes\(ctx\.team\)/, 'team analysis is matched by explicit PBE team tags');
assert.match(editorial, /article\.players\.some\(player => keyText\(player\) === name\)/, 'player analysis prefers explicit PBE player tags');
assert.match(editorial, /title\.includes\(name\)/, 'full player-name title match is an allowed direct fallback');
assert.match(editorial, /Team context around \$\{ctx\.name\}/, 'team fallback is visibly labeled instead of implied player attribution');
assert.match(editorial, /PBE analysis is research context, not a status source/, 'context panel states the operational/editorial boundary');
assert.match(editorial, /enhanceResearchContext\(\)/, 'context rail participates in the shared editorial apply loop');
assert.match(editorial, /import '\.\.\/styles\/contextual-intel\.css'/, 'context CSS ships with the editorial chunk');
assert.match(contextCss, /\.pbec-grid/, 'context rail has responsive grid styling');
assert.match(contextCss, /@media \(max-width: 700px\)/, 'context rail has a mobile layout contract');

// Rich media is permitted only inside the already-authored PBE article subset.
// Raw source-wire rows must fail isPbeAnalysis() before summary/image/video access.
const authoredGate = editorial.indexOf('if (!isPbeAnalysis(article)) return null;');
const imageAccess = editorial.indexOf('article.image_url');
assert.ok(authoredGate >= 0 && imageAccess > authoredGate, 'story imagery is read only after the authored PBE discriminator');
assert.match(editorial, /article\?\.take\?\.summary \|\| article\?\.summary/, 'PBE editorial dek is reused after authorship verification');
assert.match(editorial, /media_embeds/, 'official video metadata is carried into the NHL newsroom');
assert.match(editorial, /api\/sports-media/, 'missing story art recovers through the shared PBE sports-media resolver');
assert.match(editorial, /kind: 'player'/, 'player headshots are the first contextual-media recovery path');
assert.match(editorial, /pbeo-watch/, 'video stories receive a dedicated newsroom surface');
assert.match(css, /NHL NEWSROOM V3/, 'V3 photo-led newsroom styling ships with the editorial layer');
assert.ok(!/bet_advice/.test(editorial), 'generated betting advice is not rendered');

// Operational truth remains on the existing NHL newsroom adapter. Editorial is
// not allowed to become the injury/goalie/transaction source of record.
assert.match(newsroom, /from '\.\.\/lib\/api\.js'/, 'Newsroom still uses the NHL API adapter');
assert.match(newsroom, /news\(\{ limit: 100 \}/, 'source wire remains live on Newsroom');
assert.match(newsroom, /WIRE_MAX_AGE_MS = 2 \* 24 \* 60 \* 60 \* 1000/, 'verified wire has a hard two-day freshness ceiling');
assert.match(newsroom, /function wireWindow\(items\)/, 'wire freshness is computed as a bounded two-day slice');
assert.match(newsroom, /const anchor = Math\.max/, 'two-day wire slice anchors to the newest valid returned headline');
assert.match(newsroom, /const wire = wireWindow\(state\.data\?\.items \|\| \[\]\)/, 'wire slice is applied before counts, filters and rendering');
assert.match(newsroom, /safeUrl\(r\.url\) && inWireWindow\(r, anchor\)/, 'related alternate-source coverage uses the same two-day anchor');
assert.match(newsroom, /const count = list\.length;/, 'related-source count reflects only links still inside the two-day window');
assert.match(newsroom, /class="dk-wire-health"/, 'wire source diagnostics are collapsed into a compact details surface');
assert.match(newsroom, /class="dk-wire-shell"/, 'wire renders as one unified secondary desk');
assert.doesNotMatch(newsroom, /<aside class="dk-n-side">/, 'wire no longer renders a competing sticky sidebar');
assert.match(newsroom, /How the wire is labelled/, 'wire methodology remains available on demand');
assert.match(css, /NHL SOURCE WIRE V4/, 'wire cleanup styling ships with the newsroom');
assert.match(watcher, /news\(\{ limit: 60 \}/, 'watcher still consumes verified source wire');

assert.match(main, /styles\/product-depth\.css/, 'product-depth CSS is loaded');
assert.match(main, /services\/editorial-depth\.js/, 'PBE editorial layer is booted');
assert.ok(!/Math\.random\s*\(/.test(editorial), 'editorial layer contains no synthetic/random data');
assert.ok(!/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(editorial), 'editorial layer contains no frontend secret contract');

// --- player photos: the production chain, wired end to end ---------------
// Audited live on 2026-09-12: the NHL API, the asset feed and the deployed
// image proxy all answered 200 for 15/15 players. The defects were in the
// frontend, so these guards are about wiring, not about the proxy.
const playerPage = fs.readFileSync('src/pages/player.js', 'utf8');
const teamPage = fs.readFileSync('src/pages/team.js', 'utf8');
const matchupPage = fs.readFileSync('src/pages/matchup.js', 'utf8');

assert.match(player, /export function playerIdentity\(\{ id, name, team, position = null, number = null, size = 'md', credit = false, href = null, label = false, headshot = null, priority = false \}/, 'identity accepts an authoritative headshot and a hero priority flag');
assert.match(player, /Authoritative first: the URL the NHL payload itself returned/, 'the authoritative payload URL is documented as first priority');
assert.match(player, /if \(supplied\) urls\.push\(supplied\);/, 'a payload-provided headshot is pushed ahead of any constructed URL');
assert.match(playerPage, /headshot: p\.headshot/, 'the player hero uses the profile payload own headshot');
assert.match(playerPage, /priority: true/, 'the hero identity is not lazy-loaded behind the fold');
assert.match(teamPage, /headshot: p\.headshot/, 'roster rows use the roster payload own headshot');
assert.match(matchupPage, /name: `\$\{r\.firstName\?\.default \|\| ''\} \$\{r\.lastName\?\.default \|\| ''\}`, team: t,/, 'matchup skater rows pass the club, or every avatar falls back to initials');
assert.match(playerPage, /Fan-voted fight record/, 'player profiles expose the hockey-native fan-voted fight record');
assert.match(playerPage, /\/nhl\/game\/\$\{candidate\.game_id\}\/cast/, 'fight history is built from the same documented PBE Cast fight ledger');
assert.match(playerPage, /FIGHT W-L-D/, 'fight wins, losses and draws are first-class player stats');
assert.match(playerPage, /cell\('FIGHT W-L-D'/, 'fight W-L-D is visible in the main NHL season stat strip, not only the history panel');
assert.match(playerPage, /PBE Cast →/, 'every documented fight links back to its game record');
assert.match(playerPage, /not an official NHL decision/, 'fan-vote outcomes are never mislabeled as official NHL results');

// The shared image proxy returns HTTP 200 for an unreachable upstream (a 1x1
// transparent GIF), so onerror alone can never catch that failure.
assert.match(player, /if \(img\.naturalWidth <= SENTINEL_PX \|\| img\.naturalHeight <= SENTINEL_PX\) return runtime\.next\(img\);/, 'a 1x1 proxy placeholder is treated as a miss, not as a photo');
assert.match(player, /frame\?\.classList\.add\('is-failed'\)/, 'an exhausted candidate list marks the frame failed');
assert.match(css, /\.pid__frame\.is-failed \.pid__fallback \{ visibility: visible; \}/, 'a failed photo restores the branded fallback instead of an empty frame');
assert.match(player, /misses: 0/, 'photo misses are countable at runtime');
assert.match(player, /import\.meta\.env\.DEV/, 'photo misses log in development only, never per-avatar in production');
assert.match(player, /loading="eager" fetchpriority="high"/, 'priority identities load eagerly');
assert.match(player, /loading="lazy"/, 'non-critical avatars stay lazy');
assert.match(css, /object-fit: contain/, 'transparent NHL mugs are contained, never face-cropped');

console.log('NHL product depth: PASS — photos + PBE-first analysis + contextual research + attributed source-wire separation');
