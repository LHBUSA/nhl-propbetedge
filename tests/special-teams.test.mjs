// Special-teams engine: manpower truth, box reconstruction, and refusal to
// invent a countdown.
//
// situationCode format is [away goalie in net][away skaters][home skaters][home
// goalie in net], so '1541' is away 5 / home 4 with both goalies in net.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specialTeams, classify, manpowerAt, clockText, STATE } from '../src/lib/special-teams.js';

const play = (over = {}) => ({
  period: 1, period_type: 'REG', time_in_period: '10:00', elapsed_s: 600,
  situation_code: '1551', side: null, type: 'stoppage', kind: 'stoppage',
  players: [], shot: null, ...over
});
const penalty = (over = {}) => play({
  type: 'penalty', kind: 'penalty',
  penalty: { severity: 'MIN', desc_key: 'tripping', duration_min: 2 },
  players: [{ role: 'committed_by', id: 1, name: 'Jane Doe', number: 27 }],
  ...over
});

// ---- manpower classification ----------------------------------------------
test('5v4 identifies the away side as advantaged', () => {
  const c = classify(manpowerAt(play({ situation_code: '1541' })));
  assert.equal(c.state, STATE.POWER_PLAY);
  assert.equal(c.advantaged_side, 'away');
  assert.equal(c.shorthanded_side, 'home');
  assert.equal(c.manpower, '5v4');
});

test('4v5 reverses the sides', () => {
  const c = classify(manpowerAt(play({ situation_code: '1451' })));
  assert.equal(c.state, STATE.POWER_PLAY);
  assert.equal(c.advantaged_side, 'home');
  assert.equal(c.shorthanded_side, 'away');
});

test('5v3 is its own state', () => {
  const c = classify(manpowerAt(play({ situation_code: '1531' })));
  assert.equal(c.state, STATE.FIVE_ON_THREE);
  assert.equal(c.advantaged_side, 'away');
});

test('4v4 is NOT a power play', () => {
  const c = classify(manpowerAt(play({ situation_code: '1441' })));
  assert.equal(c.state, STATE.FOUR_ON_FOUR);
  assert.equal(c.advantaged_side, null);
  assert.equal(c.shorthanded_side, null);
});

test('a pulled goalie at 6v5 is not mislabelled a power play', () => {
  // away goalie OUT, away 6 skaters, home 5, home goalie in
  const c = classify(manpowerAt(play({ situation_code: '0651' })));
  assert.equal(c.state, STATE.EV, 'an extra attacker is not a man advantage');
  assert.equal(c.advantaged_side, null);
  // and the reverse
  const c2 = classify(manpowerAt(play({ situation_code: '1560' })));
  assert.equal(c2.state, STATE.EV);
  assert.equal(c2.advantaged_side, null);
});

test('a shorthanded team that also pulls its goalie is still shorthanded', () => {
  // away goalie out, away 5 skaters (=4 penalised), home 5 with goalie
  const c = classify(manpowerAt(play({ situation_code: '0551' })));
  assert.equal(c.advantaged_side, 'home');
});

// ---- box reconstruction ----------------------------------------------------
test('a minor puts exactly one player in the box with an exact countdown', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', time_in_period: '10:00' }),
    play({ elapsed_s: 640, situation_code: '1541' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.state, STATE.POWER_PLAY);
  assert.equal(st.advantaged_side, 'away');
  assert.equal(st.active_penalties.length, 1);
  const [pen] = st.active_penalties;
  assert.equal(pen.player_name, 'Jane Doe');
  assert.equal(pen.player_number, 27, 'jersey number is carried into the visual penalty-box state');
  assert.equal(pen.infraction, 'tripping');
  assert.equal(pen.remaining_seconds, 80, '120s penalty, 40s elapsed on the official clock');
  assert.equal(pen.certainty, 'exact');
  assert.equal(clockText(pen.remaining_seconds), '1:20');
});

test('5v3 supports two box entries for one team', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'Player A' }], penalty: { severity: 'MIN', desc_key: 'hooking', duration_min: 2 } }),
    penalty({ elapsed_s: 630, side: 'home', players: [{ role: 'committed_by', id: 2, name: 'Player B' }], penalty: { severity: 'MIN', desc_key: 'delaying-game', duration_min: 2 } }),
    play({ elapsed_s: 650, situation_code: '1531' })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.state, STATE.FIVE_ON_THREE);
  assert.equal(st.active_penalties.length, 2);
  assert.deepEqual(st.active_penalties.map(x => x.player_name).sort(), ['Player A', 'Player B']);
  assert.ok(st.active_penalties.every(x => x.side === 'home'));
  assert.equal(st.certainty, 'exact');
});

test('an expired penalty leaves the box', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    play({ elapsed_s: 721, situation_code: '1551' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.active_penalties.length, 0);
  assert.equal(st.state, STATE.EV);
});

test('coincidental minors produce 4v4 and claim no power play', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'Home Guy' }] }),
    penalty({ elapsed_s: 600, side: 'away', players: [{ role: 'committed_by', id: 2, name: 'Away Guy' }] }),
    play({ elapsed_s: 620, situation_code: '1441' })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.state, STATE.FOUR_ON_FOUR);
  assert.equal(st.advantaged_side, null);
  assert.equal(st.active_penalties.length, 2);
  assert.ok(st.active_penalties.every(x => x.coincidental), 'both are marked coincidental');
});

test('a misconduct sits a player without shorthanding the team', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', penalty: { severity: 'MIS', desc_key: 'misconduct', duration_min: 10 } }),
    play({ elapsed_s: 620, situation_code: '1551' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.state, STATE.EV, 'a misconduct is not a power play');
  assert.equal(st.active_penalties.length, 1);
  assert.equal(st.active_penalties[0].affects_manpower, false);
});

test('a power-play goal ends the minor', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    play({ elapsed_s: 640, type: 'goal', kind: 'goal', side: 'away', situation_code: '1541', shot: { goal: true, on_goal: true } }),
    play({ elapsed_s: 660, situation_code: '1551' })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.active_penalties.length, 0, 'the minor is released by the goal against');
  assert.equal(st.state, STATE.EV);
});

test('an even-strength goal does NOT release a penalty', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    // goal scored while the code says 4v4: nobody was up a skater
    play({ elapsed_s: 640, type: 'goal', kind: 'goal', side: 'away', situation_code: '1441', shot: { goal: true } }),
    play({ elapsed_s: 650, situation_code: '1541' })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.active_penalties.length, 1, 'a 4v4 goal cannot release a minor');
});

// ---- truth over completeness ----------------------------------------------
test('when reconstruction disagrees with the situation code, NO countdown is shown', () => {
  // the code says even strength, yet a minor looks active: refuse to time it
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    play({ elapsed_s: 620, situation_code: '1551' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.state, STATE.EV, 'situationCode is the authority');
  assert.equal(st.certainty, 'partial');
  assert.ok(st.active_penalties.every(x => x.remaining_seconds === null), 'no fabricated countdown');
  assert.ok(st.active_penalties.every(x => x.certainty === 'unknown'));
  assert.equal(clockText(null), null);
});

test('a penalty with no duration is reported but never timed', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', penalty: { severity: 'MIN', desc_key: 'tripping', duration_min: null } }),
    play({ elapsed_s: 620, situation_code: '1541' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.certainty, 'partial', 'an untimeable penalty downgrades certainty');
});

// ---- delayed penalty -------------------------------------------------------
test('a delayed penalty is its own state, distinct from an empty net', () => {
  const plays = [
    play({ elapsed_s: 600, type: 'delayed-penalty', kind: 'delayed-penalty', side: 'home' }),
    play({ elapsed_s: 605, situation_code: '0651', type: 'shot-on-goal', side: 'away', shot: { on_goal: true } })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.state, STATE.DELAYED_PENALTY);
  assert.equal(st.delayed.offending_side, 'home');
  assert.equal(st.advantaged_side, 'away', 'the non-offending side has the extra attacker');
});

test('a plain pulled goalie is not a delayed penalty', () => {
  const st = specialTeams([play({ elapsed_s: 600, situation_code: '0651' })], { cursorIndex: 0 });
  assert.equal(st.state, STATE.EV);
  assert.equal(st.delayed, null);
});

test('the delay resolves once the penalty is actually called', () => {
  const plays = [
    play({ elapsed_s: 600, type: 'delayed-penalty', kind: 'delayed-penalty', side: 'home' }),
    penalty({ elapsed_s: 604, side: 'home' }),
    play({ elapsed_s: 620, situation_code: '1541' })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.state, STATE.POWER_PLAY, 'the signal became a real penalty');
});

// ---- replay ----------------------------------------------------------------
test('the replay cursor rebuilds the historical box, not the final state', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    play({ elapsed_s: 640, situation_code: '1541' }),
    play({ elapsed_s: 721, situation_code: '1551' }),
    play({ elapsed_s: 900, situation_code: '1551' })
  ];
  const during = specialTeams(plays, { cursorIndex: 1 });
  const after = specialTeams(plays, { cursorIndex: 3 });
  assert.equal(during.state, STATE.POWER_PLAY);
  assert.equal(during.active_penalties.length, 1);
  assert.equal(after.state, STATE.EV);
  assert.equal(after.active_penalties.length, 0, 'the end of the game must not leak into an earlier cursor');
  // and scrubbing back reproduces it exactly
  assert.deepEqual(specialTeams(plays, { cursorIndex: 1 }), during);
});

test('the power-play segment counts only shots taken during it', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home' }),
    play({ elapsed_s: 610, situation_code: '1541', type: 'shot-on-goal', side: 'away', shot: { on_goal: true, goal: false, blocked: false, shootout: false } }),
    play({ elapsed_s: 615, situation_code: '1541', type: 'missed-shot', side: 'away', shot: { on_goal: false, goal: false, blocked: false, shootout: false } }),
    play({ elapsed_s: 618, situation_code: '1541', type: 'shot-on-goal', side: 'home', shot: { on_goal: true, goal: false, blocked: false, shootout: false } })
  ];
  const st = specialTeams(plays, { cursorIndex: 3 });
  assert.equal(st.pp_segment.attempts, 2, 'only the advantaged side, only this segment');
  assert.equal(st.pp_segment.sog, 1);
  assert.equal(st.pp_segment.goals, 0);
});

test('no fabricated analytics fields exist on the state', () => {
  const st = specialTeams([play({ situation_code: '1541', elapsed_s: 600 })], { cursorIndex: 0 });
  const json = JSON.stringify(st);
  for (const bad of ['xg', 'zone_time', 'possession', 'shot_quality', 'expected', 'clear_count']) {
    assert.ok(!new RegExp(bad, 'i').test(json), `no fabricated ${bad}`);
  }
});

// ---- penalty-call transition, per-penalty certainty (2026-09-26) ------------
// A call is logged at a stopped clock with the PRE-penalty situationCode; the
// faceoff that restarts play is the first play that can show the new manpower.
// Assessed duration, remaining time and manpower agreement are separate facts.

const faceoff = (over = {}) => play({ type: 'faceoff', kind: 'faceoff', ...over });
const goal = (over = {}) => play({ type: 'goal', kind: 'goal', shot: { goal: true, on_goal: true }, ...over });
const who = st => st.active_penalties.map(x => [x.player_name, x.remaining_seconds, x.certainty]);

test('1. penalty-call transition: the call still says 5v5, a clean minor shows 2:00', () => {
  const plays = [
    faceoff({ elapsed_s: 590, situation_code: '1551' }),
    penalty({ elapsed_s: 600, side: 'home', situation_code: '1551' })
  ];
  const st = specialTeams(plays, { cursorIndex: 1 });
  assert.equal(st.active_penalties.length, 1);
  const [pen] = st.active_penalties;
  assert.equal(pen.remaining_seconds, 120, 'full assessed time at the call: 0 s of game clock have run');
  assert.equal(clockText(pen.remaining_seconds), '2:00');
  assert.equal(pen.certainty, 'transition');
  assert.equal(st.certainty, 'transition');
  assert.equal(st.state, STATE.EV, 'manpower still comes only from the code');
});

test('2. first ensuing 5v4 play at 9:52 shows 1:52 and is exact', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', situation_code: '1551' }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    play({ elapsed_s: 608, type: 'shot-on-goal', side: 'away', situation_code: '1541', shot: { on_goal: true } })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.equal(st.state, STATE.POWER_PLAY);
  assert.deepEqual(who(st), [['Jane Doe', 112, 'exact']]);
  assert.equal(clockText(st.active_penalties[0].remaining_seconds), '1:52');
  assert.equal(st.certainty, 'exact');
});

test('3. stoppage: no game time passes, so the box clock does not move', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', situation_code: '1551' }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    play({ elapsed_s: 608, type: 'stoppage', kind: 'stoppage', situation_code: '1541' }),
    play({ elapsed_s: 608, type: 'stoppage', kind: 'stoppage', situation_code: '1541' })
  ];
  const a = specialTeams(plays, { cursorIndex: 2 });
  const b = specialTeams(plays, { cursorIndex: 3 });
  assert.equal(a.active_penalties[0].remaining_seconds, 112);
  assert.equal(b.active_penalties[0].remaining_seconds, 112, 'wall-clock time is never an input');
  const src = readFileSync(new URL('../src/lib/special-teams.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const banned of ['setInterval', 'setTimeout', 'Date.now', 'new Date', 'performance.now']) {
    assert.ok(!src.includes(banned), `special-teams engine must not use ${banned}`);
  }
});

test('4. actual contradiction: play resumes and stays 5v5 -> clock withheld, duration kept', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', situation_code: '1551' }),
    faceoff({ elapsed_s: 600, situation_code: '1551' }),
    play({ elapsed_s: 620, type: 'shot-on-goal', side: 'away', situation_code: '1551', shot: { on_goal: true } })
  ];
  for (const cursor of [1, 2]) {
    const st = specialTeams(plays, { cursorIndex: cursor });
    const [pen] = st.active_penalties;
    assert.equal(pen.remaining_seconds, null, `withheld at cursor ${cursor}`);
    assert.equal(pen.certainty, 'unknown');
    assert.equal(pen.duration_min, 2, 'the assessed duration is still known');
    assert.equal(st.certainty, 'partial');
  }
});

test('5. power-play goal ends the minor; in a 5v3 it releases only the first-ending minor', () => {
  const two = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'First' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    penalty({ elapsed_s: 630, side: 'home', situation_code: '1541', players: [{ role: 'committed_by', id: 2, name: 'Second' }] }),
    faceoff({ elapsed_s: 630, situation_code: '1531' }),
    goal({ elapsed_s: 650, side: 'away', situation_code: '1531' }),
    faceoff({ elapsed_s: 650, situation_code: '1541' })
  ];
  const st = specialTeams(two, { cursorIndex: 5 });
  assert.deepEqual(who(st), [['Second', 100, 'exact']], 'one goal releases one minor: the one ending first');
  assert.equal(st.state, STATE.POWER_PLAY);
});

test('6. coincidental minors keep exact clocks and claim no power play', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'Home Guy' }] }),
    penalty({ elapsed_s: 600, side: 'away', players: [{ role: 'committed_by', id: 2, name: 'Away Guy' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1441' }),
    play({ elapsed_s: 620, situation_code: '1441' })
  ];
  const st = specialTeams(plays, { cursorIndex: 3 });
  assert.equal(st.advantaged_side, null);
  assert.ok(st.active_penalties.every(x => x.coincidental && x.remaining_seconds === 100 && x.certainty === 'exact'));
  assert.equal(st.certainty, 'exact');
});

test('7. 5v3: two independent clocks, and an ambiguity on the other side does not erase them', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'A' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    penalty({ elapsed_s: 630, side: 'home', situation_code: '1541', players: [{ role: 'committed_by', id: 2, name: 'B' }] }),
    faceoff({ elapsed_s: 630, situation_code: '1531' }),
    play({ elapsed_s: 650, situation_code: '1531' })
  ];
  const st = specialTeams(plays, { cursorIndex: 4 });
  assert.equal(st.state, STATE.FIVE_ON_THREE);
  assert.deepEqual(who(st), [['A', 70, 'exact'], ['B', 100, 'exact']]);
  // an away penalty with no duration makes only the AWAY side unprovable
  const mixed = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'A' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    penalty({ elapsed_s: 640, side: 'away', situation_code: '1541', penalty: { severity: 'MIN', desc_key: 'slashing', duration_min: null }, players: [{ role: 'committed_by', id: 3, name: 'C' }] }),
    faceoff({ elapsed_s: 640, situation_code: '1441' })
  ];
  const m = specialTeams(mixed, { cursorIndex: 3 });
  assert.deepEqual(who(m), [['A', 80, 'exact']], 'the home clock stays provable');
  assert.equal(m.certainty, 'partial', 'overall certainty still reports the ambiguity');
});

test("8. misconduct creates no power play; paired with the same player's minor its start is not provable", () => {
  const alone = [
    penalty({ elapsed_s: 600, side: 'home', penalty: { severity: 'MIS', desc_key: 'misconduct', duration_min: 10 } }),
    faceoff({ elapsed_s: 600, situation_code: '1551' })
  ];
  const a = specialTeams(alone, { cursorIndex: 1 });
  assert.equal(a.state, STATE.EV);
  assert.equal(a.active_penalties[0].affects_manpower, false);
  assert.equal(a.active_penalties[0].remaining_seconds, 600);
  const paired = [
    penalty({ elapsed_s: 600, side: 'home' }),
    penalty({ elapsed_s: 600, side: 'home', penalty: { severity: 'MIS', desc_key: 'misconduct', duration_min: 10 } }),
    faceoff({ elapsed_s: 600, situation_code: '1541' })
  ];
  const p = specialTeams(paired, { cursorIndex: 2 });
  const mis = p.active_penalties.find(x => x.severity === 'MIS');
  const min = p.active_penalties.find(x => x.severity === 'MIN');
  assert.equal(mis.remaining_seconds, null, 'served after the minor: start not provable from the call');
  assert.equal(min.remaining_seconds, 120);
  assert.equal(min.certainty, 'exact');
});

test('9. replay scrub backward reproduces every clock exactly', () => {
  const plays = [
    faceoff({ elapsed_s: 590, situation_code: '1551' }),
    penalty({ elapsed_s: 600, side: 'home', situation_code: '1551' }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    play({ elapsed_s: 640, situation_code: '1541' }),
    goal({ elapsed_s: 660, side: 'away', situation_code: '1541' }),
    faceoff({ elapsed_s: 660, situation_code: '1551' })
  ];
  const forward = plays.map((_, i) => specialTeams(plays, { cursorIndex: i }));
  const backward = plays.map((_, i) => specialTeams(plays, { cursorIndex: plays.length - 1 - i })).reverse();
  assert.deepEqual(backward, forward);
  assert.deepEqual(forward.map(s => s.active_penalties[0]?.remaining_seconds ?? 'none'), ['none', 120, 120, 80, 'none', 'none']);
});

test('10. a penalty carries over the period boundary on game time only', () => {
  const plays = [
    penalty({ period: 1, time_in_period: '19:30', elapsed_s: 1170, side: 'home', situation_code: '1551' }),
    faceoff({ period: 1, time_in_period: '19:30', elapsed_s: 1170, situation_code: '1541' }),
    play({ period: 1, time_in_period: '20:00', elapsed_s: 1200, type: 'period-end', kind: 'period-end', situation_code: null }),
    faceoff({ period: 2, time_in_period: '00:00', elapsed_s: 1200, situation_code: '1541' }),
    play({ period: 2, time_in_period: '00:45', elapsed_s: 1245, situation_code: '1541' })
  ];
  assert.equal(specialTeams(plays, { cursorIndex: 2 }).active_penalties[0].remaining_seconds, 90, 'intermission consumes nothing');
  const p2 = specialTeams(plays, { cursorIndex: 4 });
  assert.deepEqual(who(p2), [['Jane Doe', 45, 'exact']]);
});

test('11. double minor: 4:00; a goal in the first half restarts a fresh 2:00, a goal in the second half ends it', () => {
  const dm = { severity: 'MIN', desc_key: 'high-sticking-double-minor', duration_min: 4 };
  const base = [
    penalty({ elapsed_s: 600, side: 'home', penalty: dm, situation_code: '1551' }),
    faceoff({ elapsed_s: 600, situation_code: '1541' })
  ];
  assert.equal(specialTeams(base, { cursorIndex: 0 }).active_penalties[0].remaining_seconds, 240);
  const early = [...base, goal({ elapsed_s: 660, side: 'away', situation_code: '1541' }), faceoff({ elapsed_s: 660, situation_code: '1541' }), play({ elapsed_s: 700, situation_code: '1541' })];
  const e = specialTeams(early, { cursorIndex: 4 });
  assert.deepEqual(who(e), [['Jane Doe', 80, 'exact']], 'second minor started at the goal: 120 - 40');
  assert.deepEqual(e.active_penalties[0].notes, ['double_minor_first_half_released']);
  const late = [...base, goal({ elapsed_s: 780, side: 'away', situation_code: '1541' }), faceoff({ elapsed_s: 780, situation_code: '1551' })];
  assert.equal(specialTeams(late, { cursorIndex: 3 }).active_penalties.length, 0, 'second-half goal releases the double minor');
});

test('REGRESSION: Anders Lee high-sticking (2025020446, real production window)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/pbecast-anders-lee-2025020446.json', import.meta.url), 'utf8'));
  const plays = fx.plays;
  const at = sort => plays.findIndex(p => p.sort_order === sort);
  const lee = st => st.active_penalties.find(x => x.player_id === 8475314);
  // the call itself still carries the pre-enforcement 5v5 code
  assert.equal(plays[at(340)].situation_code, '1551');
  assert.equal(plays[at(344)].situation_code, '1451');
  const call = lee(specialTeams(plays, { cursorIndex: at(340) }));
  assert.equal(call.player_name, 'Anders Lee');
  assert.equal(call.player_number, 27, 'game-day number from this game's rosterSpots (he wears #72 for Utah from 2026-27)');
  assert.equal(fx.jersey_trace.source_rosterSpot_sweaterNumber, 27);
  const spot = plays.flatMap(p => p.players).find(p => p.id === 8475314);
  assert.equal(spot.number, 27, 'the frozen normalized PBEcast payload carries 27');
  assert.equal(call.infraction, 'high-sticking');
  assert.equal(call.duration_min, 2);
  assert.equal(clockText(call.remaining_seconds), '2:00', 'must NOT regress to "remaining time unavailable"');
  assert.equal(call.certainty, 'transition');
  const fo = specialTeams(plays, { cursorIndex: at(344) });
  assert.equal(fo.state, STATE.POWER_PLAY);
  assert.equal(fo.shorthanded_side, 'away');
  assert.equal(clockText(lee(fo).remaining_seconds), '2:00');
  assert.equal(lee(fo).certainty, 'exact');
  assert.equal(clockText(lee(specialTeams(plays, { cursorIndex: at(346) })).remaining_seconds), '1:18', '06:40 is 42 s after 05:58');
  // never withheld while he is in the box; gone after expiry
  for (let i = at(340); i < plays.length; i++) {
    const x = lee(specialTeams(plays, { cursorIndex: i }));
    if (plays[i].elapsed_s < 1558 + 120) assert.ok(x && x.remaining_seconds !== null, `clock provable at sort ${plays[i].sort_order}`);
    else assert.equal(x, undefined, `released after expiry (sort ${plays[i].sort_order})`);
  }
});

test('UI copy never pairs a known duration with "official box time unavailable"', () => {
  const src = readFileSync(new URL('../src/pages/cast.js', import.meta.url), 'utf8');
  assert.ok(!/official box time unavailable/i.test(src));
  assert.ok(!/countdown withheld/i.test(src));
  assert.ok(/assessed/.test(src) && /Remaining time unavailable/.test(src));
});

test('coincidental minors on top of a power play (4v3) keep every clock', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'Tripper' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    penalty({ elapsed_s: 630, side: 'home', situation_code: '1541', penalty: { severity: 'MIN', desc_key: 'roughing', duration_min: 2 }, players: [{ role: 'committed_by', id: 2, name: 'Home Rough' }] }),
    penalty({ elapsed_s: 630, side: 'away', situation_code: '1541', penalty: { severity: 'MIN', desc_key: 'roughing', duration_min: 2 }, players: [{ role: 'committed_by', id: 3, name: 'Away Rough' }] }),
    faceoff({ elapsed_s: 630, situation_code: '1431' }),
    play({ elapsed_s: 640, situation_code: '1431' })
  ];
  const st = specialTeams(plays, { cursorIndex: 5 });
  assert.equal(st.state, STATE.POWER_PLAY);
  assert.ok(st.active_penalties.every(x => x.remaining_seconds !== null), JSON.stringify(st.active_penalties));
  assert.equal(st.certainty, 'exact');
});

test('a call already stamped with the post-enforcement code is not a contradiction', () => {
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'A' }] }),
    faceoff({ elapsed_s: 600, situation_code: '1541' }),
    penalty({ elapsed_s: 640, side: 'home', situation_code: '1531', players: [{ role: 'committed_by', id: 2, name: 'B' }] })
  ];
  const st = specialTeams(plays, { cursorIndex: 2 });
  assert.deepEqual(who(st), [['A', 80, 'exact'], ['B', 120, 'transition']]);
});

test('a third stacked minor cannot be timed: verified manpower clocks are withheld', () => {
  const pl = (id, t) => penalty({ elapsed_s: t, side: 'home', situation_code: '1531', players: [{ role: 'committed_by', id, name: `P${id}` }] });
  const plays = [
    penalty({ elapsed_s: 600, side: 'home', players: [{ role: 'committed_by', id: 1, name: 'P1' }] }), faceoff({ elapsed_s: 600, situation_code: '1541' }),
    pl(2, 610), faceoff({ elapsed_s: 610, situation_code: '1531' }),
    pl(3, 620), faceoff({ elapsed_s: 620, situation_code: '1531' })
  ];
  const st = specialTeams(plays, { cursorIndex: 5 });
  assert.ok(st.active_penalties.every(x => x.remaining_seconds === null && x.duration_min === 2));
  assert.equal(st.certainty, 'partial');
});
