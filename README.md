# Hydrogen Instant Search — a headless Shopify storefront

A headless [Shopify Hydrogen](https://hydrogen.shopify.dev/) storefront whose hero
feature is a **zero-latency, client-side faceted instant search**. Built on
Hydrogen 2026.4 + React Router 7, and deployed to **Cloudflare Workers** (edge).

> **▶ Live demo:** https://hydrogen-showcase.h-inouchi.workers.dev/instant-search
> Uses Shopify's public **mock.shop** sample catalog — no login, just click.
> **▶ 70-second walkthrough:** https://www.loom.com/share/8dbedc57802b420a804b0b6c4fa93013

---

## What it demonstrates

Most Shopify search is a form that reloads the page on every query. This shows a
different bar: **the full catalog is fetched once on the server (SSR), then every
keystroke and every facet toggle is computed in memory** — no network round-trip
per interaction, so results update in well under a millisecond. A live
`filtered in N ms` readout makes the speed visible.

It's a focused portfolio piece for headless/Hydrogen, Storefront API, and
performance-minded frontend work — the kind of build agencies subcontract.

## Performance

Lighthouse via [PageSpeed Insights](https://pagespeed.web.dev/), on the live
`/instant-search` page:

| Metric | 📱 Mobile | 🖥 Desktop |
|---|---|---|
| **Performance** | **98** | **100** |
| First Contentful Paint | 1.5 s | 0.4 s |
| Largest Contentful Paint | 2.2 s | 0.5 s |
| Total Blocking Time | 0 ms | 0 ms |
| Cumulative Layout Shift | 0 | 0 |
| Speed Index | 1.5 s | 0.4 s |
| Accessibility / Best Practices / SEO | 96 / 96 / 92 | 96 / 96 / 92 |

Responsive images via Hydrogen's `<Image>` (Shopify CDN resizing + `srcset`) and
edge SSR keep LCP and blocking time low; the in-memory search adds no per-keystroke
network cost.

## The instant-search feature (`/instant-search`)

- **Search-as-you-type** over the in-memory catalog, with the matched substring
  highlighted in each result title.
- **Faceted filtering** across six dimensions: category, audience, color (with
  swatches), size, price band, and availability.
- **Correct faceted counts** — each group's counts reflect the *other* active
  facets (so toggling a value never zeroes out its own siblings), the standard
  e-commerce faceting behavior that naïve filters get wrong.
- **Removable filter chips**, clear-all, and an empty state.
- **Zero per-keystroke network**: the route loader returns the whole (normalized,
  lean) catalog once; all filtering is `useMemo` over that array.

## Architecture

- **Hydrogen 2026.4 + React Router 7** — server-rendered route + client hydration.
- **Loader (SSR):** queries the Storefront API once (`products(first: 100)`),
  flattens each product to a small client-friendly shape, and edge-caches it
  (`CacheLong`) — the catalog is static, so it's served instantly from the edge.
- **Client (`app/components/InstantSearch.jsx`):** a self-contained faceted search
  engine — universe/facet derivation, faceted counts, price bucketing, query
  matching with highlight — all in plain React state + `useMemo`.
- **Data:** Shopify **mock.shop** (public sample catalog, no auth) — so the demo is
  clickable by anyone, with no password wall.
- **Hosting:** **Cloudflare Workers**. Hydrogen's build emits a workerd module
  worker (`dist/server/index.js`, a standard `fetch(request, env, ctx)` export)
  plus static client assets, which run natively on Cloudflare's edge.

## Technical notes

- **Faceted counts done right** — computed by filtering on the query plus every
  group *except* the one being counted (`matchesFacets(it, filters, skip)`).
- **No hydration mismatch on the timing readout** — the `N ms` number is captured
  during filtering but only rendered after mount, so the (non-deterministic)
  server and client values can't disagree.
- **Hydrogen → Cloudflare without Oxygen** — Oxygen requires a paid plan and
  doesn't support dev stores, so this deploys the same workerd worker to Cloudflare
  Workers via `wrangler.toml` (Workers Static Assets for `/assets/*`, the SSR
  worker for everything else). Validated locally on `wrangler dev` (real workerd)
  before shipping.

**Stack:** Shopify Hydrogen 2026.4 · Storefront API · React Router 7 · Vite /
rolldown · Cloudflare Workers (wrangler) · mock.shop.

---

## Member pricing (headless) — integrating a Shopify app into Hydrogen

A second feature on the product page that solves a real headless-migration problem:
**a Shopify app's theme app extension does not run on a headless storefront.** The
companion app [Member Prices](https://github.com/h-inouchi/shopify-idea) shows
VIP/wholesale customers their member price on the product page via a Liquid theme
extension — which Hydrogen can't load. This reproduces it natively in React, fed by
the same data and matching the checkout Function exactly.

How it's wired (`app/routes/products.$handle.jsx`):
- Reads the app's **storefront-readable shop metafield** `member_prices/rules` in the
  product query.
- Identifies the logged-in customer via the **Customer Account API** and looks up their
  **tags via the Admin API** server-side (`app/lib/adminApi.server.js`) — the Customer
  Account API doesn't expose tags, and the Admin token never reaches the client.
- Computes the member price with the **shared `app/lib/memberPrices.js`** module (ported
  from the app's logic + tested for parity), so the **storefront price equals the price
  the checkout Function charges**. Logged-out visitors see a teaser, and a
  "preview as segment" control renders any segment's price from the real rules.

> **▶ Live demo (real store):** https://hydrogen-member-demo.h-inouchi.workers.dev/products/the-videographer-snowboard
> — a separate preview pointed at a store with the Member Prices app installed. Try the
> teaser and the "Preview member price as: VIP / Wholesale" control.

The feature is **additive and dormant**: with no `member_prices/rules` metafield (e.g. the
mock.shop deployment) it renders nothing, so the main public demo is unaffected. See
`.env.example` for the real-store vars + the server-only `PRIVATE_ADMIN_API_TOKEN`.

**What it demonstrates:** wiring a Shopify app's functionality into a custom headless
storefront across the Storefront, Customer Account, and Admin APIs — a common ask when
merchants move to Hydrogen.

---

# Development

Built on the [Shopify Hydrogen / React Router template](https://github.com/Shopify/shopify-app-template-react-router);
the sections below cover running and deploying this storefront.

### Requirements

- Node **20.x** for the Hydrogen dev/build toolchain (this repo was run on 20.18.3).
- Node **22.x** for Wrangler (Cloudflare CLI requires ≥ 22).

### Run locally

```bash
npm install
npm run dev          # http://localhost:3000  (open /instant-search)
```

> **WSL / Linux note:** if dev fails with *"Cannot find native binding"* (rolldown),
> install the platform binary that npm's optional-deps bug skipped:
> `npm i --no-save @rolldown/binding-linux-x64-gnu@<rolldown version>`.

### Build & deploy to Cloudflare

```bash
npm run build                       # emits dist/server (worker) + dist/client (assets)
npx wrangler@latest login           # one-time, Cloudflare account (uses Node 22)
npx wrangler@latest deploy          # → https://hydrogen-showcase.<subdomain>.workers.dev
```

Config lives in [`wrangler.toml`](wrangler.toml). The Storefront client defaults to
mock.shop when `PUBLIC_STORE_DOMAIN` is unset; only `SESSION_SECRET` is required.
