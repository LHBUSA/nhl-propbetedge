import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNonblockingMarketRefresh } from '../src/lib/nonblocking-market-refresh.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve=a; reject=b; });
  return {promise,resolve,reject};
};

test('score paint does not wait for a stalled market request', async () => {
  const market=deferred();
  let scorePaints=0, marketPaints=0;
  const enrich=createNonblockingMarketRefresh({
    load:()=>market.promise,
    onSettled:()=>{marketPaints++;}
  });
  const score=await Promise.resolve({away:3,home:2});
  if (score.away===3) scorePaints++;
  const pending=enrich.refresh();
  await Promise.resolve();
  assert.equal(scorePaints,1);
  assert.equal(marketPaints,0);
  market.resolve(new Map());
  await pending;
  assert.equal(marketPaints,1);
});

test('repeated score ticks coalesce to one optional market read', async () => {
  const d=deferred();
  let loads=0,paints=0;
  const refresh=createNonblockingMarketRefresh({
    load:()=>{loads++;return d.promise;},
    onSettled:()=>{paints++;}
  });
  const a=refresh.refresh(),b=refresh.refresh(),c=refresh.refresh();
  assert.equal(a,b);assert.equal(b,c);
  await Promise.resolve();
  assert.equal(loads,1);
  d.resolve();
  await a;
  assert.equal(paints,1);
  await refresh.refresh();
  assert.equal(loads,2);
});

test('optional market failures do not poison later refreshes', async () => {
  let calls=0,paints=0;
  const refresh=createNonblockingMarketRefresh({
    load:()=>{if(++calls===1)throw new Error('market offline');return new Map();},
    onSettled:()=>{paints++;}
  });
  await refresh.refresh();
  assert.equal(paints,0);
  await refresh.refresh();
  assert.equal(paints,1);
  assert.equal(calls,2);
});

test('a late market response cannot repaint an unmounted Ice Board', async () => {
  const d=deferred();let paints=0,loads=0;
  const refresh=createNonblockingMarketRefresh({
    load:()=>{loads++;return d.promise;},
    onSettled:()=>{paints++;}
  });
  const pending=refresh.refresh();
  await Promise.resolve();
  refresh.stop();
  d.resolve(new Map());
  await pending;
  assert.equal(paints,0);
  assert.equal(refresh.refresh(),null);
  assert.equal(loads,1);
});

test('no optional market fetch or paint while tab is hidden', async () => {
  let active=false,paints=0,loads=0;
  const refresh=createNonblockingMarketRefresh({
    load:()=>{loads++;return new Map();},
    onSettled:()=>{paints++;},
    isActive:()=>active
  });
  assert.equal(refresh.refresh(),null);
  active=true;
  await refresh.refresh();
  assert.equal(loads,1);assert.equal(paints,1);
  active=false;
  assert.equal(refresh.refresh(),null);
});

test('Ice Board integration has a market-independent score path and cleanup', () => {
  const source=readFileSync(new URL('../src/pages/board.js',import.meta.url),'utf8');
  assert.match(source,/const todayRes = await ctx\.board\(todayET\(\)/);
  assert.doesNotMatch(source,/Promise\.all\(\[ctx\.board\(todayET\(\).*kalshi\.loadBoard\(\)/);
  assert.match(source,/marketRefresh\.refresh\(\)/);
  assert.match(source,/marketRefresh\.stop\(\)/);
});
