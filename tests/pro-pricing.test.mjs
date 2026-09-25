import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/lib/pro.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('NHL Pro Founding Season is $9.99 monthly and $3.99 weekly', () => {
  assert.match(source, /monthly:[\s\S]*price: '\$9\.99'[\s\S]*cadence: '\/ month'/);
  assert.match(source, /weekly:[\s\S]*price: '\$3\.99'[\s\S]*cadence: '\/ week'/);
  assert.match(source, /return NHL_PRO_PLANS\[value\] \? value : 'monthly'/);
});

test('NHL Pro has no trial; NHL-only checkout stays off while its payment links are inactive', () => {
  assert.match(source, /const OPEN_FOR_PURCHASE = false/);
  assert.match(source, /url\.searchParams\.set\('locked_prefilled_email', email\)/, 'the checkout email is locked to the NHL Pro identity');
  assert.match(source, /No free trial/);
  assert.doesNotMatch(source, /trial_period_days|free trial for|start trial/i);
});

test('NHL checkout is Stripe hosted and never Vercel runtime', () => {
  assert.match(source, /plink_1UEWmLF3CaVzg4ORwxmpwjSz/);
  assert.match(source, /plink_1UEWmSF3CaVzg4ORdWk3Yqcj/);
  assert.match(source, /https:\/\/buy\.stripe\.com\/14AbJ13A2fKS3lr8Ez7wA0B/);
  assert.match(source, /https:\/\/buy\.stripe\.com\/6oUfZh6MegOW9JP4oj7wA0C/);
  assert.doesNotMatch(source, /fetch\([^\n]*\/api\/checkout|['"]\/api\/checkout/);
});

test('NHL app loads Pro only after renderShell', () => {
  const renderAt = main.indexOf('const main = renderShell(app)');
  const proAt = main.indexOf("import('./lib/pro.js')");
  assert.ok(renderAt >= 0 && proAt > renderAt, 'Pro module must mount after the shell exists');
});

test('query parameters never grant entitlement', () => {
  assert.match(source, /Query params never grant entitlement/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(pro|paid|entitl)/i);
});
