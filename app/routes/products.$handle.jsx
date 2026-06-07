import {useLoaderData} from 'react-router';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import {ProductPrice} from '~/components/ProductPrice';
import {ProductImage} from '~/components/ProductImage';
import {ProductForm} from '~/components/ProductForm';
import {MemberPrice} from '~/components/MemberPrice';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {
  parseRules,
  bestSegmentForTags,
  maxPct,
  computeMemberMoney,
} from '~/lib/memberPrices';
import {fetchCustomerTags} from '~/lib/adminApi.server';

/**
 * @type {Route.MetaFunction}
 */
export const meta = ({data}) => {
  return [
    {title: `Hydrogen | ${data?.product.title ?? ''}`},
    {
      rel: 'canonical',
      href: `/products/${data?.product.handle}`,
    },
  ];
};

/**
 * @param {Route.LoaderArgs} args
 */
export async function loader(args) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 * @param {Route.LoaderArgs}
 */
async function loadCriticalData({context, params, request}) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) {
    throw new Error('Expected product handle to be defined');
  }

  const [{product, shop}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: product});

  // Member pricing (headless equivalent of the Member Prices theme extension).
  // Best-effort and never blocks the 200 — dormant when there's no config.
  const memberPricing = await loadMemberPricing({context, shop, product});

  return {
    product,
    memberPricing,
  };
}

/**
 * Resolve the member price for this request, mirroring the Member Prices Liquid
 * block (and the checkout Function). Returns null whenever member pricing
 * shouldn't show — no metafield (e.g. mock.shop), not logged in without a
 * teaser, a logged-in non-member, or any error — so the page never breaks.
 * @param {{context: any, shop: any, product: any}}
 */
async function loadMemberPricing({context, shop, product}) {
  try {
    const rules = parseRules(shop?.metafield?.value);
    // No rules → dormant. This runs BEFORE any login/Admin call (mock.shop path).
    if (rules.length === 0) return null;

    const loggedIn = await context.customerAccount.isLoggedIn();
    if (!loggedIn) {
      const top = maxPct(rules);
      return top > 0 ? {state: 'teaser', maxPct: top} : null;
    }

    const {data} = await context.customerAccount.query(MEMBER_CUSTOMER_ID_QUERY);
    const customerGid = data?.customer?.id;
    const tags = customerGid
      ? await fetchCustomerTags(context.env, customerGid)
      : null;

    const best = bestSegmentForTags(rules, tags ?? []);
    if (!best) return null; // logged-in non-member sees nothing (like Liquid)

    // Precompute member prices for the variants present in the payload; the
    // component recomputes client-side for any variant not listed here.
    const variantPrices = {};
    for (const variant of collectVariants(product)) {
      if (variant?.id && variant?.price) {
        variantPrices[variant.id] = computeMemberMoney(
          variant.price,
          best.percentage,
        );
      }
    }

    return {
      state: 'member',
      segment: best.segment,
      pct: best.percentage,
      variantPrices,
    };
  } catch {
    return null;
  }
}

/** Collect every variant present in the product payload (by id, deduped). */
function collectVariants(product) {
  const out = [];
  const seen = new Set();
  const push = (v) => {
    if (v?.id && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  };
  push(product?.selectedOrFirstAvailableVariant);
  for (const v of product?.adjacentVariants ?? []) push(v);
  for (const option of product?.options ?? []) {
    for (const value of option?.optionValues ?? []) {
      push(value?.firstSelectableVariant);
    }
  }
  return out;
}

// Plain string (not `#graphql`) so Storefront codegen doesn't try to validate
// this Customer Account API query against the Storefront schema.
const MEMBER_CUSTOMER_ID_QUERY = `query MemberCustomerId { customer { id } }`;

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 * @param {Route.LoaderArgs}
 */
function loadDeferredData({context, params}) {
  // Put any API calls that is not critical to be available on first page render
  // For example: product reviews, product recommendations, social feeds.

  return {};
}

export default function Product() {
  /** @type {LoaderReturnData} */
  const {product, memberPricing} = useLoaderData();

  // Optimistically selects a variant with given available variant information
  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  // Sets the search param to the selected variant without navigation
  // only when no search params are set in the url
  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  // Get the product options array
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const {title, descriptionHtml} = product;

  return (
    <div className="product">
      <ProductImage image={selectedVariant?.image} />
      <div className="product-main">
        <h1>{title}</h1>
        <ProductPrice
          price={selectedVariant?.price}
          compareAtPrice={selectedVariant?.compareAtPrice}
        />
        <MemberPrice
          memberPricing={memberPricing}
          selectedVariant={selectedVariant}
        />
        <br />
        <ProductForm
          productOptions={productOptions}
          selectedVariant={selectedVariant}
        />
        <br />
        <br />
        <p>
          <strong>Description</strong>
        </p>
        <br />
        <div dangerouslySetInnerHTML={{__html: descriptionHtml}} />
        <br />
      </div>
      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: selectedVariant?.price.amount || '0',
              vendor: product.vendor,
              variantId: selectedVariant?.id || '',
              variantTitle: selectedVariant?.title || '',
              quantity: 1,
            },
          ],
        }}
      />
    </div>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
`;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    adjacentVariants (selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo {
      description
      title
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
`;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
    shop {
      metafield(namespace: "member_prices", key: "rules") {
        value
      }
    }
  }
  ${PRODUCT_FRAGMENT}
`;

/** @typedef {import('./+types/products.$handle').Route} Route */
/** @typedef {ReturnType<typeof useLoaderData<typeof loader>>} LoaderReturnData */
