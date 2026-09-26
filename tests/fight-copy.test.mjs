// Fight copy contract (owner 2026-09-26): the truth disclosure appears ONCE per
// page; cards say COMMUNITY RESULT; no card repeats NOT OFFICIAL or claims an
// official winner. Semantics (pairing, source, thresholds, score) unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fightCard, resultLine } from '../src/pages/fights.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const fight = (result) => ({
  game_id: 2025021000, date: '2026-03-01', period: 3, clock: '19:08', teams: { away: 'DAL', home: 'MIN' },
  fighters: [{ player_id: 1, name: 'Justin Hryckowian', team_abbrev: 'DAL', penalty_minutes: 5 }, { player_id: 2, name: 'Michael McCarron', team_abbrev: 'MIN', penalty_minutes: 5 }],
  result, momentum: { available: true, pre: { away: { attempts: 1, shots_on_goal: 1, goals: 0, penalties: 0 }, home: { attempts: 2, shots_on_goal: 1, goals: 0, penalties: 0 } }, post: { away: { attempts: 3, shots_on_goal: 2, goals: 0, penalties: 0 }, home: { attempts: 1, shots_on_goal: 0, goals: 0, penalties: 0 } }, pre_window_s: 300, post_window_s: 300, semantics: 'Descriptive, not causal: counts of recorded events.' }
});
const voted = fight({ type: 'fan_vote', status: 'available', winner_name: 'Justin Hryckowian', winner_pct: 30, vote_count: 6, rating: 4.7 });
const none = fight({ type: 'fan_vote', status: 'not_found' });

test('1. the page-level disclosure exists once, with a Fight Score methodology link', () => {
  const page = src('pages/fights.js');
  const hits = page.match(/the NHL does not declare fight winners/g) || [];
  assert.equal(hits.length, 1);
  assert.match(page, /href="#\/methodology\?section=fights"[^>]*>How Fight Score works</);
});

test('2. the methodology link resolves to the fights section', () => {
  assert.match(src('pages/methodology.js'), /id: 'fights'/);
});

test('3. a result card is labelled COMMUNITY RESULT with winner · % · votes · rating', () => {
  const html = resultLine(voted);
  assert.match(html, /COMMUNITY RESULT/);
  assert.match(html, /Justin Hryckowian/);
  assert.match(html, /30% · 6 votes · 4\.7\/10/);
  assert.equal(resultLine(none).replace(/<[^>]+>/g, '').trim(), 'No community result');
});

test('4. no card claims an official winner; 5. NOT OFFICIAL / causal disclaimer not repeated per card', () => {
  const cards = [voted, none, voted].map(fightCard).join('');
  assert.doesNotMatch(cards, /NOT OFFICIAL/i);
  assert.doesNotMatch(cards, /official (NHL )?(winner|result)/i);
  assert.doesNotMatch(cards, /does not declare/i);
  assert.doesNotMatch(cards, /not causal/i, 'causal disclaimer lives in the team footnote + methodology, not in cards');
  assert.match(cards, /Descriptive window/, 'expanded panel carries the small Descriptive window label');
  const collapsed = cards.match(/<summary[^>]*>([^<]*)<\/summary>/g) || [];
  assert.ok(collapsed.length && collapsed.every(s => />5:00 before \/ after</.test(s)), 'collapsed window label carries no causal disclaimer');
  for (const f of ['pages/cast.js', 'pages/player.js', 'components/player-intel.js', 'components/game-intel.js']) {
    assert.doesNotMatch(src(f), /NOT OFFICIAL|not an official NHL result|Fan votes are not official/i, f);
  }
});
