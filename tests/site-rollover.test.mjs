import assert from 'node:assert/strict';
import { SITE_ROLLOVER_HOUR_ET, todayET } from '../src/lib/format.js';

assert.equal(SITE_ROLLOVER_HOUR_ET, 5, 'site rollover stays at 05:00 ET');

// Sep 20, 2026 is EDT (UTC-4): 08:59Z = 04:59 ET, 09:00Z = 05:00 ET.
assert.equal(todayET(new Date('2026-09-20T08:59:59Z')), '2026-09-19', '04:59 ET still belongs to the prior hockey slate');
assert.equal(todayET(new Date('2026-09-20T09:00:00Z')), '2026-09-20', '05:00 ET rolls to the new hockey slate');

// Pin DST-safe behavior too: Nov 8 is EST (UTC-5), so the same LOCAL
// 05:00 boundary occurs at a different UTC instant.
assert.equal(todayET(new Date('2026-11-08T09:59:59Z')), '2026-11-07', '04:59 EST still belongs to the prior slate');
assert.equal(todayET(new Date('2026-11-08T10:00:00Z')), '2026-11-08', '05:00 EST rolls forward');

console.log('site-rollover: OK');
