/**
 * Run with: node --test app/lib/memberPrices.test.js
 * No test framework needed — uses Node's built-in test runner.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRules,
  bestSegmentForTags,
  maxPct,
  amountToCents,
  centsToAmount,
  memberPriceCents,
  computeMemberMoney,
} from './memberPrices.js';

test('parseRules: valid array of rules', () => {
  const out = parseRules(
    JSON.stringify([
      {segment: 'vip', percentage: 20},
      {segment: 'wholesale', percentage: 35},
    ]),
  );
  assert.deepEqual(out, [
    {segment: 'vip', percentage: 20},
    {segment: 'wholesale', percentage: 35},
  ]);
});

test('parseRules: bad input never throws', () => {
  assert.deepEqual(parseRules(null), []);
  assert.deepEqual(parseRules(undefined), []);
  assert.deepEqual(parseRules('not json'), []);
  assert.deepEqual(parseRules('{"not":"array"}'), []);
});

test('parseRules: drops unknown segments and non-positive pct, clamps, dedupes (keep highest)', () => {
  const out = parseRules(
    JSON.stringify([
      {segment: 'platinum', percentage: 50}, // unknown -> drop
      {segment: 'vip', percentage: 0}, // <=0 -> drop
      {segment: 'vip', percentage: 10},
      {segment: 'vip', percentage: 25}, // dedupe -> keep 25
      {segment: 'gold', percentage: 150}, // clamp -> 100
      {segment: 'silver', percentage: '15'}, // numeric string -> 15
    ]),
  );
  const bySeg = Object.fromEntries(out.map((r) => [r.segment, r.percentage]));
  assert.equal(bySeg.vip, 25);
  assert.equal(bySeg.gold, 100);
  assert.equal(bySeg.silver, 15);
  assert.equal('platinum' in bySeg, false);
});

test('bestSegmentForTags: case-insensitive, highest matching pct wins', () => {
  const rules = [
    {segment: 'vip', percentage: 20},
    {segment: 'wholesale', percentage: 35},
  ];
  assert.deepEqual(bestSegmentForTags(rules, ['VIP']), {
    segment: 'vip',
    percentage: 20,
  });
  // customer in both segments -> highest pct
  assert.deepEqual(bestSegmentForTags(rules, ['vip', 'Wholesale']), {
    segment: 'wholesale',
    percentage: 35,
  });
  assert.equal(bestSegmentForTags(rules, ['retail']), null);
  assert.equal(bestSegmentForTags(rules, []), null);
});

test('maxPct: highest across all rules (teaser)', () => {
  assert.equal(
    maxPct([
      {segment: 'vip', percentage: 20},
      {segment: 'b2b', percentage: 40},
    ]),
    40,
  );
  assert.equal(maxPct([]), 0);
});

test('amountToCents: decimal-string MoneyV2 -> integer cents, rounding float drift', () => {
  assert.equal(amountToCents('40.0'), 4000);
  assert.equal(amountToCents('19.99'), 1999); // Number*100 drifts to 1998.999…; must round
  assert.equal(amountToCents('0'), 0);
  assert.equal(amountToCents('abc'), 0);
  assert.equal(centsToAmount(3200), '32.00');
});

test('memberPriceCents: matches Liquid round-half-up (the +50 before /100)', () => {
  assert.equal(memberPriceCents(4000, 20), 3200); // 40.00 @20% -> 32.00
  assert.equal(memberPriceCents(1, 50), 1); // 0.5 rounds up to 1
  assert.equal(memberPriceCents(3, 50), 2); // 1.5 rounds up to 2
  assert.equal(memberPriceCents(1000, 0), 1000); // 0% unchanged
  assert.equal(memberPriceCents(1000, 100), 0); // 100% off
});

test('computeMemberMoney: end-to-end MoneyV2 -> member MoneyV2', () => {
  assert.deepEqual(
    computeMemberMoney({amount: '40.0', currencyCode: 'USD'}, 20),
    {amount: '32.00', currencyCode: 'USD'},
  );
  assert.deepEqual(
    computeMemberMoney({amount: '19.99', currencyCode: 'EUR'}, 10),
    // 1999 -> floor((1999*90+50)/100)=floor(1799.6)=1799 -> 17.99
    {amount: '17.99', currencyCode: 'EUR'},
  );
});
