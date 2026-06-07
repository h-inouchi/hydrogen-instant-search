import {useState} from 'react';
import {Money} from '@shopify/hydrogen';
import {computeMemberMoney} from '~/lib/memberPrices';

/**
 * Storefront display of the member price — the headless equivalent of the
 * Member Prices theme app extension (which can't run on Hydrogen).
 *
 * - `memberPricing == null` → renders nothing (dormant: no rules / mock.shop).
 * - Real view: a logged-in member sees their price; everyone else sees a teaser.
 * - Demo control: a "preview as segment" selector computes any segment's price
 *   from the SAME shop-metafield rules + shared calc, so the pricing logic is
 *   visible without being a member. The previewed price equals what the checkout
 *   Function would charge that segment.
 *
 * @param {{memberPricing: any, selectedVariant: any}} props
 */
export function MemberPrice({memberPricing, selectedVariant}) {
  const [preview, setPreview] = useState('');
  if (!memberPricing) return null;

  const price = selectedVariant?.price;
  const rules = memberPricing.rules ?? [];

  // Which segment's price to show: an explicit preview selection, else the
  // customer's real segment (when they're a logged-in member).
  const activeSegment =
    preview || (memberPricing.state === 'member' ? memberPricing.segment : '');
  const activeRule = rules.find((r) => r.segment === activeSegment);
  const isPreview = Boolean(preview) && memberPricing.state !== 'member';

  return (
    <div className="member-price-wrap">
      {activeRule && price ? (
        <div className="member-price" data-member-price>
          <span className="member-price__label">
            {isPreview ? `${activeRule.segment} price (preview):` : `Your ${activeRule.segment} price:`}
          </span>
          <span className="member-price__amount" data-member-amount>
            <Money
              data={
                memberPricing.variantPrices?.[selectedVariant?.id] ||
                computeMemberMoney(price, activeRule.percentage)
              }
            />
          </span>
          <s className="member-price__compare">
            <Money data={price} />
          </s>
          <span className="member-price__badge">
            {activeRule.percentage}% off
          </span>
        </div>
      ) : memberPricing.state !== 'member' ? (
        <div className="member-price member-price--teaser">
          <span className="member-price__teaser">
            VIP or wholesale customer?{' '}
            <a className="member-price__login" href="/account/login">
              Log in
            </a>{' '}
            to see your price — members save up to {memberPricing.maxPct}%.
          </span>
        </div>
      ) : null}

      {rules.length > 0 && (
        <label className="member-price__preview">
          <span>Preview member price as:</span>{' '}
          <select value={preview} onChange={(e) => setPreview(e.target.value)}>
            <option value="">
              {memberPricing.state === 'member' ? 'Your view' : 'Guest'}
            </option>
            {rules.map((r) => (
              <option key={r.segment} value={r.segment}>
                {r.segment} (−{r.percentage}%)
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
