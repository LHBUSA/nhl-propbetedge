import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replayBar } from '../src/components/replay.js';

const cast = {
  plays: [
    { type: 'period-start', period: 1, period_type: 'REG', time_remaining: '20:00', time_in_period: '00:00' },
    { type: 'shot-on-goal', period: 1, period_type: 'REG', time_remaining: '18:41', time_in_period: '01:19', shot: {} },
    { type: 'goal', period: 1, period_type: 'REG', time_remaining: '17:02', time_in_period: '02:58' }
  ]
};

test('live PBE Cast opens already following live with no replay Play button', () => {
  const html = replayBar({ cursor: null, playing: false, speed: 'normal' }, cast, { live: true });
  assert.match(html, /LIVE · Following/);
  assert.match(html, /Live feed auto-follows/);
  assert.equal(html.includes('data-rp="play"'), false, 'live edge must not ask the user to press Play');
  assert.equal(html.includes('replay__speed'), false, 'replay speed controls stay out of the live edge');
});

test('stepping behind live restores replay Play controls and Jump to live', () => {
  const html = replayBar({ cursor: 1, playing: false, speed: 'normal' }, cast, { live: true });
  assert.match(html, /data-rp="play"/);
  assert.match(html, /aria-label="Play"/);
  assert.match(html, /Jump to live/);
});

test('command-center game tiles open the cast directly and Watch remains alerts-only', async () => {
  const src = await readFile(new URL('../src/pages/cast-center.js', import.meta.url), 'utf8');
  assert.match(src, /data-open-cast=/);
  assert.match(src, /role="link"/);
  assert.match(src, /location\.hash = `#\/cast\/\$\{tile\.dataset\.openCast\}`/);
  assert.match(src, /Watch star is alerts-only/);
  assert.match(src, /event\.target\.closest\?\.\('a, button, input, select, textarea, \[role="button"\]'/);
});

test('live replay completion returns to the live edge instead of stopping one event behind', async () => {
  const src = await readFile(new URL('../src/pages/cast.js', import.meta.url), 'utf8');
  assert.match(src, /state\.cursor = liveNow \? null : n - 1/);
  assert.match(src, /liveNow && state\.cursor === null\) return/);
});
