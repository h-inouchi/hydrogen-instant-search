import {useLoaderData} from 'react-router';
import {InstantSearch} from '~/components/InstantSearch';

/**
 * @type {Route.MetaFunction}
 */
export const meta = () => {
  return [{title: `Hydrogen | Instant Search`}];
};

const CATEGORY_TAGS = ['tops', 'bottoms', 'shoes', 'accessories'];
const AUDIENCE_TAGS = ['men', 'women', 'unisex'];

/**
 * Load the whole catalog once on the server, then all search + faceting happens
 * client-side in memory — zero network per keystroke, so it feels instant.
 * @param {Route.LoaderArgs}
 */
export async function loader({context}) {
  const {storefront} = context;
  const {products} = await storefront.query(CATALOG_QUERY, {
    variables: {first: 100},
    // The mock.shop catalog is static; cache it hard at the edge.
    cache: storefront.CacheLong(),
  });

  const items = (products?.nodes ?? []).map(normalizeProduct);
  return {items};
}

/**
 * Flatten a Storefront product into a lean, client-friendly shape so the SSR
 * payload stays small and the in-memory filter is trivial.
 * @param {any} node
 */
function normalizeProduct(node) {
  const tags = (node.tags ?? []).map((t) => t.toLowerCase());
  const option = (name) =>
    (node.options ?? [])
      .find((o) => o.name?.toLowerCase() === name)
      ?.optionValues?.map((v) => v.name) ?? [];

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    image: node.featuredImage
      ? {
          url: node.featuredImage.url,
          altText: node.featuredImage.altText ?? node.title,
          width: node.featuredImage.width,
          height: node.featuredImage.height,
        }
      : null,
    price: Number(node.priceRange?.minVariantPrice?.amount ?? 0),
    currency: node.priceRange?.minVariantPrice?.currencyCode ?? 'USD',
    available: Boolean(node.availableForSale),
    categories: tags.filter((t) => CATEGORY_TAGS.includes(t)),
    audiences: tags.filter((t) => AUDIENCE_TAGS.includes(t)),
    colors: option('color'),
    sizes: option('size'),
  };
}

export default function InstantSearchRoute() {
  /** @type {LoaderReturnData} */
  const {items} = useLoaderData();
  return <InstantSearch items={items} />;
}

const CATALOG_QUERY = `#graphql
  query InstantSearchCatalog($country: CountryCode, $language: LanguageCode, $first: Int)
  @inContext(country: $country, language: $language) {
    products(first: $first) {
      nodes {
        id
        handle
        title
        tags
        availableForSale
        featuredImage {
          url
          altText
          width
          height
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        options {
          name
          optionValues {
            name
          }
        }
      }
    }
  }
`;

/** @typedef {import('./+types/instant-search').Route} Route */
/** @typedef {ReturnType<typeof useLoaderData<typeof loader>>} LoaderReturnData */
