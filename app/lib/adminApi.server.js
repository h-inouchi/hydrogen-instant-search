/**
 * Server-only Admin API helper.
 *
 * Customer tags are NOT exposed by the Customer Account API, so to know which
 * member segment a logged-in customer belongs to we look up their tags via the
 * Admin GraphQL API. This file is `*.server.js` so the token never reaches the
 * client bundle, and the token is read only from `env` (a non-`PUBLIC_` var).
 *
 * Best-effort: returns `null` on ANY problem (no token, mock.shop, network,
 * GraphQL errors). The caller treats `null` as "no member pricing", so the
 * product page can never break because of this lookup.
 */

const ADMIN_API_VERSION = '2026-04';

// Plain string (no `#graphql` tag) so codegen doesn't validate it against the
// Storefront schema — this is an Admin API query.
const CUSTOMER_TAGS_QUERY = `query CustomerTags($id: ID!) {
  customer(id: $id) { tags }
}`;

/**
 * @param {Record<string, any>} env - the worker env (wrangler vars + secrets)
 * @param {string} customerGid - e.g. "gid://shopify/Customer/123" (as returned
 *   by the Customer Account API customer.id — Admin's customer(id:) wants the
 *   same gid, so no reformatting)
 * @returns {Promise<string[] | null>}
 */
export async function fetchCustomerTags(env, customerGid) {
  const token = env?.PRIVATE_ADMIN_API_TOKEN;
  const domain = env?.PUBLIC_STORE_DOMAIN;
  if (!token || !customerGid || !domain || !domain.endsWith('.myshopify.com')) {
    return null;
  }

  try {
    const res = await fetch(
      `https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({
          query: CUSTOMER_TAGS_QUERY,
          variables: {id: customerGid},
        }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.errors || !json?.data?.customer) return null;
    const tags = json.data.customer.tags;
    return Array.isArray(tags) ? tags : [];
  } catch {
    return null;
  }
}
