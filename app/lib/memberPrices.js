/**
 * Member Prices — shared pricing logic, ported from the companion Shopify app
 * (stackable-discounts/app/segments.ts) and its Liquid theme block.
 *
 * This is the source of truth that makes the storefront member price EQUAL the
 * price the Shopify Function applies at checkout. Keep the segment vocabulary,
 * the rules parsing, and the round-half-up cents math identical to the app.
 *
 * Pure module: no React / Hydrogen imports, so it runs on the server, the
 * client, and under `node --test`.
 */

/**
 * Fixed segment vocabulary, shared with the app's Function (whose input query
 * references these literal `hasAnyTag` strings at author time). Merchants tag a
 * customer with one of these and map a percentage to it.
 * Keep in sync with stackable-discounts/app/segments.ts.
 */
export const SEGMENTS = [
  'vip',
  'wholesale',
  'gold',
  'silver',
  'b2b',
  'member',
  'trade',
  'staff',
];

export const RULES_NAMESPACE = 'member_prices';
export const RULES_KEY = 'rules';

/** @param {unknown} value */
export function isSegment(value) {
  return typeof value === 'string' && SEGMENTS.includes(value);
}

/** @param {unknown} value @returns {number | null} */
function clampPct(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Parse + sanitize the rules JSON from the shop metafield. Never throws: drops
 * invalid/unknown segments, clamps percentages to 0–100, drops non-positive
 * percentages (matching the Function, which only applies positive rules), and
 * de-duplicates by segment keeping the highest percentage.
 *
 * @param {string | null | undefined} value
 * @returns {{segment: string, percentage: number}[]}
 */
export function parseRules(value) {
  if (!value) return [];
  let raw;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  /** @type {Map<string, number>} */
  const bySegment = new Map();
  for (const entry of raw) {
    const segment = entry?.segment;
    const pct = clampPct(entry?.percentage);
    if (!isSegment(segment) || pct === null || pct <= 0) continue;
    const existing = bySegment.get(segment);
    if (existing === undefined || pct > existing) bySegment.set(segment, pct);
  }
  return [...bySegment.entries()].map(([segment, percentage]) => ({
    segment,
    percentage,
  }));
}

/**
 * The customer's best matching rule: the highest-percentage rule whose segment
 * matches one of the customer's tags (case-insensitive on both sides). This is
 * what the Liquid block and the Function both resolve to.
 *
 * @param {{segment: string, percentage: number}[]} rules
 * @param {string[]} tags
 * @returns {{segment: string, percentage: number} | null}
 */
export function bestSegmentForTags(rules, tags) {
  const lowered = new Set((tags ?? []).map((t) => String(t).toLowerCase()));
  let best = null;
  for (const rule of rules) {
    if (!lowered.has(rule.segment.toLowerCase())) continue;
    if (!best || rule.percentage > best.percentage) best = rule;
  }
  return best;
}

/**
 * Highest percentage across all rules — used for the logged-out teaser
 * ("members save up to X%").
 * @param {{segment: string, percentage: number}[]} rules
 */
export function maxPct(rules) {
  return rules.reduce((m, r) => (r.percentage > m ? r.percentage : m), 0);
}

/**
 * Storefront MoneyV2 amounts are decimal strings ("40.0"), but the Function and
 * Liquid work in integer minor units. Convert to cents ONCE, with rounding to
 * absorb float error (Number("40.0") * 100 can drift).
 * @param {string | number} amount
 */
export function amountToCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** @param {number} cents */
export function centsToAmount(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * The member price in cents. Mirrors the Liquid:
 *   variant.price | times: (100 - pct) | plus: 50 | divided_by: 100
 * The `+ 50` before the integer division is round-half-up; do NOT add another
 * Math.round on top. For non-negative integer inputs this equals Liquid's
 * `divided_by` exactly, so storefront == checkout.
 * @param {number} priceCents
 * @param {number} pct
 */
export function memberPriceCents(priceCents, pct) {
  return Math.floor((priceCents * (100 - pct) + 50) / 100);
}

/**
 * Compute a member-price MoneyV2 from a regular-price MoneyV2 and a percentage.
 * @param {{amount: string, currencyCode: string}} priceMoneyV2
 * @param {number} pct
 * @returns {{amount: string, currencyCode: string}}
 */
export function computeMemberMoney(priceMoneyV2, pct) {
  const cents = memberPriceCents(amountToCents(priceMoneyV2.amount), pct);
  return {amount: centsToAmount(cents), currencyCode: priceMoneyV2.currencyCode};
}
