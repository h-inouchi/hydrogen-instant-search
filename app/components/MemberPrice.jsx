import {Money} from '@shopify/hydrogen';
import {computeMemberMoney} from '~/lib/memberPrices';

/**
 * Storefront display of the member price — the headless equivalent of the
 * Member Prices theme app extension (which can't run on Hydrogen).
 *
 * - `memberPricing == null` → renders nothing (dormant: no metafield, not a
 *   member, or any error). This is what keeps the mock.shop deployment clean.
 * - `state: 'member'` → the logged-in customer's price, updating on variant
 *   change. Uses the loader-precomputed price when available, else recomputes
 *   client-side so optimistic/adjacent variants are always correct.
 * - `state: 'teaser'` → a login prompt for logged-out visitors.
 *
 * The displayed member price equals what the checkout Function charges, because
 * both derive from the same rules + `computeMemberMoney` in ~/lib/memberPrices.
 *
 * @param {{
 *   memberPricing: import('~/lib/memberPricing').MemberPricing | null,
 *   selectedVariant: any,
 * }} props
 */
export function MemberPrice({memberPricing, selectedVariant}) {
  if (!memberPricing) return null;

  if (memberPricing.state === 'teaser') {
    return (
      <div className="member-price member-price--teaser">
        <span className="member-price__teaser">
          VIP or wholesale customer?{' '}
          <a className="member-price__login" href="/account/login">
            Log in
          </a>{' '}
          to see your price — members save up to {memberPricing.maxPct}%.
        </span>
      </div>
    );
  }

  const price = selectedVariant?.price;
  if (!price) return null;

  const memberMoney =
    (selectedVariant?.id &&
      memberPricing.variantPrices?.[selectedVariant.id]) ||
    computeMemberMoney(price, memberPricing.pct);

  return (
    <div className="member-price" data-member-price>
      <span className="member-price__label">
        Your {memberPricing.segment} price:
      </span>
      <span className="member-price__amount" data-member-amount>
        <Money data={memberMoney} />
      </span>
      <s className="member-price__compare">
        <Money data={price} />
      </s>
      <span className="member-price__badge">{memberPricing.pct}% off</span>
    </div>
  );
}
