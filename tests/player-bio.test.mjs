// Player biography layer (nhl-player-bio/1.0.0). Fixtures are NHL landing
// payloads normalized to the /nhl/player shape and trimmed to the fields the
// bio reads (tests/fixtures/player-bio).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bioParagraphs, bioSources, buildBioFacts, careerGlance, evidenceHash, seasonText } from '../src/lib/player-bio.js';
import { renderCareerJourney, renderPlayerBio } from '../src/components/player-bio.js';

const load = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/player-bio/${name}.json`, import.meta.url), 'utf8'));
const CAST = {
  ovechkin: 8471214, crosby: 8471675, mcdavid: 8478402, shesterkin: 8478048, lundqvist: 8468685,
  jagr: 8448208, panarin: 8478550, eklund: 8485388, heineman: 8482476, schaefer: 8485366
};
const P = Object.fromEntries(Object.entries(CAST).map(([k, id]) => [k, load(String(id))]));
const DNA = load('8471214-dna');
const facts = (k, opts) => buildBioFacts(P[k], opts);
const prose = f => bioParagraphs(f).flatMap(p => p.sentences).map(s => s.text).join(' ');

// Every number printed in the prose must be recoverable from the fact packet.
function evidenceTokens(f) {
  const out = new Set();
  const add = v => {
    if (typeof v === 'number') {
      out.add(String(v)); out.add(v.toLocaleString('en-US')); out.add(v.toFixed(2)); out.add(v.toFixed(3).replace(/^0\./, ''));
      const s = seasonText(v); if (s) { out.add(s.slice(0, 4)); out.add(s.slice(5)); }
    } else if (typeof v === 'string') {
      for (const m of v.match(/\d+/g) || []) { out.add(m); out.add(String(Number(m))); }
    } else if (v && typeof v === 'object') Object.values(v).forEach(add);
  };
  add(f);
  out.add('0'); out.add('100'); // the stated 0–100 DNA scale
  return out;
}

test('every number in every bio is recoverable from its fact packet', () => {
  for (const k of Object.keys(P)) {
    const f = facts(k, k === 'ovechkin' ? { dna: DNA } : {});
    const tokens = evidenceTokens(f);
    for (const s of bioParagraphs(f).flatMap(p => p.sentences)) {
      assert.ok(s.evidence.length, `${k}: sentence without evidence: ${s.text}`);
      for (const num of s.text.replace(/(\d)(st|nd|rd|th)\b/g, '$1').match(/\d[\d,.]*\d|\d/g) || []) {
        const bare = num.replace(/\.$/, '');
        assert.ok(tokens.has(bare) || tokens.has(bare.replace(/^0/, '')), `${k}: "${bare}" not in evidence — ${s.text}`);
      }
    }
  }
});

test('Ovechkin: star career told from verified facts', () => {
  const f = facts('ovechkin', { dna: DNA });
  const t = prose(f);
  assert.equal(f.player_id, 8471214);
  assert.match(t, /^Alex Ovechkin is a left wing for the Washington Capitals\./);
  assert.match(t, /selected first overall by the Washington Capitals in the 2004 NHL Draft/);
  assert.match(t, /21 NHL regular seasons since debuting in 2005–06, all with the Washington Capitals/);
  assert.match(t, /929 goals, 758 assists and 1,687 points in 1,573 regular-season games/);
  assert.match(t, /won the Stanley Cup with the Washington Capitals in 2017–18/);
  assert.match(t, /Maurice “Rocket” Richard Trophy nine times/);
  assert.match(t, /100 Greatest Players/);
  assert.doesNotMatch(t, /Hall of Fame/, 'inHHOF 0 is never stated as fact, positive or negative');
  const words = t.split(/\s+/).length;
  assert.ok(words >= 120 && words <= 220, `Ovechkin bio is ${words} words`);
  const glance = Object.fromEntries(careerGlance(f));
  assert.equal(glance['NHL debut'], '2005–06');
  assert.equal(glance.Draft, '2004 · Rd 1 · #1 overall · WSH');
  assert.equal(glance['G / A / P'], '929 / 758 / 1,687');
  assert.equal(glance['Stanley Cups'], '1');
});

test('stars and rookies differ by available facts, not by a fame score', () => {
  const star = prose(facts('mcdavid')).split(/\s+/).length;
  const rookie = prose(facts('eklund')).split(/\s+/).length;
  assert.ok(star > rookie + 30, `McDavid ${star} vs Eklund ${rookie}`);
  assert.doesNotMatch(prose(facts('eklund')), /won|Trophy|Cup/);
});

test('statistical profile is PBE analysis, separate from NHL facts, never clichés', () => {
  const f = facts('ovechkin', { dna: DNA });
  const paras = bioParagraphs(f);
  const pbe = paras.filter(p => p.kind === 'pbe');
  assert.equal(pbe.length, 1);
  assert.match(pbe[0].sentences[0].text, /PropBetEdge Skater DNA/);
  assert.match(pbe[0].sentences[0].text, /among 401 qualified forwards/);
  assert.ok(paras.filter(p => p.kind === 'nhl').every(p => p.sentences.every(s => !/PropBetEdge|DNA/.test(s.text))), 'NHL paragraphs never carry PBE analysis');
  assert.ok(bioSources(f).some(l => /^Statistical profile: PropBetEdge analysis of NHL data/.test(l)));
  const html = renderPlayerBio(f);
  assert.match(html, /data-bio-source="PBE"/);
  assert.match(html, /Statistical profile · PropBetEdge analysis/);
  for (const k of Object.keys(P)) {
    assert.doesNotMatch(prose(facts(k, { dna: DNA })), /heart|hockey IQ|natural leader|two-way force|clutch|elite/i, k);
  }
  assert.equal(facts('ovechkin').style, null, 'no DNA payload -> no statistical-profile paragraph');
  assert.equal(facts('shesterkin', { dna: DNA }).style, null, 'goalies never get the skater DNA paragraph');
});

test('missing draft is unknown, never "undrafted"; missing awards never "no awards"', () => {
  const pan = facts('panarin');
  assert.equal(pan.draft, null);
  assert.doesNotMatch(prose(pan), /undrafted|draft/i);
  assert.equal(Object.fromEntries(careerGlance(pan)).Draft, '—');
  const hei = facts('heineman');
  assert.deepEqual(hei.honors, []);
  assert.doesNotMatch(prose(hei), /no awards|never won|without/i);
  assert.ok(!careerGlance(hei).some(([k]) => k === 'Stanley Cups'), 'no Cup row without a Cup');
});

test('draft team is the drafting club, not the debut club', () => {
  const t = prose(facts('heineman'));
  assert.match(t, /selected 43rd overall by the Florida Panthers in the 2020 NHL Draft \(round 2\)/);
  assert.match(t, /with the Montréal Canadiens and the New York Islanders/);
});

test('team chronology, no duplicate seasons, traded seasons', () => {
  for (const k of Object.keys(P)) {
    const f = facts(k);
    const seasons = f.journey.map(j => j.season);
    assert.equal(new Set(seasons).size, seasons.length, `${k}: duplicate season`);
    assert.deepEqual(seasons, [...seasons].sort((a, b) => a - b), `${k}: journey out of order`);
    const firsts = f.teams.map(t => t.first_season);
    assert.deepEqual(firsts, [...firsts].sort((a, b) => a - b), `${k}: clubs out of first-appearance order`);
  }
  const pan = facts('panarin');
  const split = pan.journey.find(j => j.season === 20252026);
  assert.deepEqual(split.clubs.map(c => [c.name, c.gp]), [['New York Rangers', 52], ['Los Angeles Kings', 26]]);
  assert.equal(split.gp, 78);
  const jagr = facts('jagr');
  assert.deepEqual(jagr.journey.find(j => j.season === 20032004).clubs.map(c => c.name), ['Washington Capitals', 'New York Rangers']);
  assert.equal(jagr.teams.length, 9);
  const html = renderCareerJourney(pan);
  assert.match(html, /data-season="20252026"[\s\S]*?New York Rangers[\s\S]*?Los Angeles Kings[\s\S]*?split season/);
  assert.match(html, /<details class="pbio-j__more">/, 'long careers collapse');
  assert.equal((renderCareerJourney(facts('ovechkin')).match(/class="pbio-j__row/g) || []).length, 21);
  assert.equal(renderCareerJourney(buildBioFacts({ ...P.eklund, season_totals: P.eklund.season_totals.slice(0, 2) })), '', 'one season -> no journey');
});

test('goalie language and stats', () => {
  const f = facts('shesterkin');
  const t = prose(f);
  assert.match(t, /is a goaltender for the New York Rangers/);
  assert.match(t, /188 wins, a \.917 save percentage, a 2\.51 goals-against average and 22 shutouts in 327 regular-season games/);
  assert.doesNotMatch(t, /\bgoals,|assists|points/);
  const g = Object.fromEntries(careerGlance(f));
  assert.equal(g['W-L-OTL'], '188-108-28');
  assert.equal(g['SV% / GAA'], '.917 / 2.51');
  assert.ok(!('G / A / P' in g));
});

test('retired player: past tense, final stats, single HHOF line', () => {
  const f = facts('lundqvist');
  const t = prose(f);
  assert.match(t, /^Henrik Lundqvist is a former NHL goaltender\./);
  assert.match(t, /played 15 NHL regular seasons between 2005–06 and 2019–20/);
  assert.match(t, /finished with 459 wins/);
  assert.equal((t.match(/Hall of Fame/g) || []).length, 1);
  assert.doesNotMatch(t, /has appeared|has played/);
});

test('sparse player: facts shorten the bio instead of inventing it', () => {
  const bare = { id: 8499999, full_name: 'Test Prospect', last_name: 'Prospect', position: 'D', is_active: true, current_team_name: 'Seattle Kraken', current_team_abbrev: 'SEA', season_totals: [], career_totals: null, honors: [], draft: null };
  const f = buildBioFacts(bare);
  assert.equal(prose(f), 'Test Prospect is a defenseman for the Seattle Kraken.');
  assert.deepEqual(careerGlance(f), [['NHL debut', '—'], ['Draft', '—']]);
  assert.equal(renderCareerJourney(f), '');
  assert.equal(buildBioFacts(null), null);
  assert.equal(buildBioFacts({ id: null }), null);
});

test('no bio renders from another player identity', () => {
  const names = Object.values(P).map(p => p.last_name);
  for (const [k, p] of Object.entries(P)) {
    const f = facts(k, k === 'ovechkin' ? { dna: DNA } : {});
    assert.equal(f.player_id, p.id);
    const t = prose(f);
    for (const other of names.filter(n => n !== p.last_name)) assert.ok(!t.includes(other), `${k} bio mentions ${other}`);
  }
  // DNA for a different player is never attached by the packet builder's caller;
  // the packet's hash changes with its evidence.
  assert.notEqual(facts('ovechkin').evidence_hash, facts('ovechkin', { dna: DNA }).evidence_hash);
  assert.equal(facts('crosby').evidence_hash, facts('crosby').evidence_hash);
  assert.equal(evidenceHash({ a: 1, b: 2 }), evidenceHash({ b: 2, a: 1 }));
});

test('render: About heading, glance rail, source line, escaped output', () => {
  const html = renderPlayerBio(facts('crosby'));
  assert.match(html, /<h2 class="pbio__h" id="pbio-h">About Sidney Crosby<\/h2>/);
  assert.match(html, /Career at a glance/);
  assert.match(html, /Biography facts: NHL · career statistics through Sep 30, 2026/);
  assert.match(html, /data-bio-schema="nhl-player-bio\/1\.0\.0"/);
  const evil = buildBioFacts({ ...P.eklund, full_name: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(renderPlayerBio(evil), /<img src=x/);
});

test('player page hierarchy: bio after hero, editorial context after the profile', () => {
  const page = fs.readFileSync(new URL('../src/pages/player.js', import.meta.url), 'utf8');
  const order = ['id="rs-p-head"', 'id="rs-p-bio"', 'id="rs-p-dna"', 'id="rs-p-body"', 'data-pbe-context-anchor', 'id="rs-p-tail"'].map(s => page.indexOf(s));
  assert.ok(order.every(i => i > 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const editorial = fs.readFileSync(new URL('../src/services/editorial-depth.js', import.meta.url), 'utf8');
  assert.match(editorial, /document\.querySelector\('\[data-pbe-context-anchor\]'\) \|\| head/);
  assert.match(editorial, /Current editorial context/);
});
