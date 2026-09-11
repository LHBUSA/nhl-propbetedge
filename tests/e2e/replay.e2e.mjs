// Interaction test for PBE Cast replay: play, pause, step, seek, deep link.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/#/cast/2025020500', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.replay', { timeout: 60000 });
const pos = async () => (await page.textContent('.replay__pos')).trim();
const score = async () => [await page.textContent('.cast-team--away .cast-team__score'), await page.textContent('.cast-team--home .cast-team__score')].map(s => s.trim()).join('-');

assert.match(await pos(), /^326\/326/, 'opens at full game');
assert.equal(await score(), '4-5');

await page.click('[data-rp="start"]');
assert.match(await pos(), /^1\/326/);
assert.equal(await score(), '0-0', 'score rebuilt from events at cursor 0');

await page.click('[data-rp-seek="goal"][data-dir="1"]');
const firstGoal = await pos();
assert.equal(await score(), '1-0', 'first goal MTL');
assert.ok(page.url().includes('?t='), 'deep link written');

await page.keyboard.press('ArrowLeft');
assert.equal(await score(), '0-0', 'stepping back before the goal restores 0-0');
await page.keyboard.press('ArrowRight');
assert.equal(await pos(), firstGoal, 'stepping forward returns to the goal');

await page.click('[data-rp-speed="fast"]');
await page.click('[data-rp="play"]');
await page.waitForTimeout(1500);
const during = await pos();
await page.click('[data-rp="play"]');
const n = Number(during.split('/')[0]);
assert.ok(n > Number(firstGoal.split('/')[0]) + 3, `playback advanced (${firstGoal} -> ${during})`);

// jump to end via marker-free control; score must equal the official final
await page.click('[data-rp="end"]');
assert.equal(await score(), '4-5', 'end of replay matches the final score');
const sogAway = (await page.textContent('.cast-team--away .cast-team__sog')).trim();
assert.match(sogAway, /^18/, 'derived SOG at end equals official 18');

await page.goto('http://127.0.0.1:5173/#/cast/2025020500?t=175', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.replay', { timeout: 60000 });
assert.equal(await score(), '1-0', 'deep link restores cursor');
assert.equal(errors.length, 0, errors.join('\n'));
console.log('replay interaction test: PASS');
await browser.close();
