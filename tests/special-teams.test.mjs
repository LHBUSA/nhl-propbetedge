// Special-teams engine: manpower truth, box reconstruction, and refusal to
// invent a countdown.
//
// situationCode format is [away goalie in net][away skaters][home skaters][home
// goalie in net], so '1541' is away 5 / home 4 with both goalies in net.
import test from 'node:test';
import assert from 'node:assert/strict';
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
