import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router';
import {Image, Money} from '@shopify/hydrogen';

/**
 * Client-side, zero-latency instant search + faceted filtering.
 *
 * The full catalog is loaded once by the route loader (SSR). Every keystroke
 * and facet toggle filters that array in memory with no network request, so the
 * result grid updates in well under a millisecond. Facet counts are computed
 * "properly": each group's counts reflect the other active facets, not itself.
 *
 * @param {{items: Product[]}} props
 */
export function InstantSearch({items}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  // Timing is captured during filtering but only shown after hydration, so the
  // server/client render of the (non-deterministic) number can't mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const universe = useMemo(() => buildUniverse(items), [items]);

  const {results, ms} = useMemo(() => {
    const t0 = now();
    const r = items.filter((it) => matchesQuery(it, query) && matchesFacets(it, filters));
    return {results: r, ms: now() - t0};
  }, [items, query, filters]);

  // Faceted counts: for each group, count over items passing the query and
  // every *other* group, so toggling a value never zeroes out its own siblings.
  const counts = useMemo(() => {
    const out = {};
    for (const facet of FACETS) {
      const base = items.filter(
        (it) =>
          matchesQuery(it, query) && matchesFacets(it, filters, facet.key),
      );
      out[facet.key] = {};
      for (const value of universe[facet.key]) {
        out[facet.key][value] = base.filter((it) =>
          facet.get(it).includes(value),
        ).length;
      }
    }
    // price + in-stock counts (also excluding their own selection)
    out.price = {};
    const priceBase = items.filter(
      (it) => matchesQuery(it, query) && matchesFacets(it, filters, 'price'),
    );
    for (const b of PRICE_BUCKETS) {
      out.price[b.id] = priceBase.filter((it) => inBucket(it.price, b)).length;
    }
    const stockBase = items.filter(
      (it) => matchesQuery(it, query) && matchesFacets(it, filters, 'inStock'),
    );
    out.inStock = stockBase.filter((it) => it.available).length;
    return out;
  }, [items, query, filters, universe]);

  const activeChips = useMemo(() => collectChips(filters), [filters]);
  const hasActive = activeChips.length > 0 || query.length > 0;

  return (
    <div className="is">
      <header className="is-head">
        <h1>Instant Search</h1>
        <p className="is-sub">
          The full catalog is loaded once, then every keystroke and filter runs
          in memory — no network round-trips. Try it.
        </p>
        <div className="is-searchbar">
          <SearchIcon />
          <input
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Search products…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
          {query && (
            <button
              className="is-clearq"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="is-meta">
          <strong>{results.length}</strong> of {items.length} products
          {mounted && (
            <span className="is-timing" title="In-memory filter time">
              · filtered in {ms < 0.1 ? '<0.1' : ms.toFixed(1)} ms
            </span>
          )}
        </div>
      </header>

      <div className="is-body">
        <aside className="is-facets" aria-label="Filters">
          <div className="is-facets-head">
            <span>Filters</span>
            {hasActive && (
              <button
                className="is-clearall"
                onClick={() => {
                  setFilters(emptyFilters());
                  setQuery('');
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {FACETS.map((facet) => (
            <FacetGroup
              key={facet.key}
              label={facet.label}
              swatch={facet.key === 'colors'}
              values={universe[facet.key]}
              counts={counts[facet.key]}
              selected={filters[facet.key]}
              onToggle={(v) =>
                setFilters((f) => toggle(f, facet.key, v))
              }
            />
          ))}

          <fieldset className="is-group">
            <legend>Price</legend>
            {PRICE_BUCKETS.map((b) => (
              <Check
                key={b.id}
                label={b.label}
                count={counts.price[b.id]}
                checked={filters.price.includes(b.id)}
                onChange={() => setFilters((f) => toggle(f, 'price', b.id))}
              />
            ))}
          </fieldset>

          <fieldset className="is-group">
            <legend>Availability</legend>
            <Check
              label="In stock only"
              count={counts.inStock}
              checked={filters.inStock}
              onChange={() =>
                setFilters((f) => ({...f, inStock: !f.inStock}))
              }
            />
          </fieldset>
        </aside>

        <section className="is-results">
          {activeChips.length > 0 && (
            <div className="is-chips">
              {activeChips.map((chip) => (
                <button
                  key={chip.key + chip.value}
                  className="is-chip"
                  onClick={() =>
                    chip.key === 'inStock'
                      ? setFilters((f) => ({...f, inStock: false}))
                      : setFilters((f) => toggle(f, chip.key, chip.value))
                  }
                >
                  {chip.label} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="is-empty">
              <p>No products match.</p>
              <button
                className="is-clearall"
                onClick={() => {
                  setFilters(emptyFilters());
                  setQuery('');
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <ul className="is-grid">
              {results.map((p, i) => (
                <li key={p.id}>
                  <Link to={`/products/${p.handle}`} className="is-card">
                    <div className="is-card-img">
                      {p.image ? (
                        <Image
                          data={p.image}
                          alt={p.image.altText}
                          aspectRatio="1/1"
                          sizes="(min-width: 44em) 240px, 45vw"
                          // Eagerly load the first row so the LCP image isn't
                          // deferred; lazy-load the rest.
                          loading={i < 6 ? 'eager' : 'lazy'}
                        />
                      ) : (
                        <div className="is-noimg" />
                      )}
                      {!p.available && (
                        <span className="is-soldout">Sold out</span>
                      )}
                    </div>
                    <div className="is-card-body">
                      <span className="is-card-title">
                        {highlight(p.title, query)}
                      </span>
                      <Money
                        data={{amount: String(p.price), currencyCode: p.currency}}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ----------------------------- facet plumbing ---------------------------- */

const FACETS = [
  {key: 'categories', label: 'Category', get: (it) => it.categories},
  {key: 'audiences', label: 'Audience', get: (it) => it.audiences},
  {key: 'colors', label: 'Color', get: (it) => it.colors},
  {key: 'sizes', label: 'Size', get: (it) => it.sizes},
];

const PRICE_BUCKETS = [
  {id: 'u50', label: 'Under $50', min: 0, max: 50},
  {id: '50-100', label: '$50 – $100', min: 50, max: 100},
  {id: '100-250', label: '$100 – $250', min: 100, max: 250},
  {id: '250-500', label: '$250 – $500', min: 250, max: 500},
  {id: '500+', label: '$500 & up', min: 500, max: Infinity},
];

function emptyFilters() {
  return {
    categories: [],
    audiences: [],
    colors: [],
    sizes: [],
    price: [],
    inStock: false,
  };
}

/** Distinct facet values present in the catalog, in a stable order. */
function buildUniverse(items) {
  const out = {categories: [], audiences: [], colors: [], sizes: []};
  for (const facet of FACETS) {
    const seen = new Set();
    for (const it of items) for (const v of facet.get(it)) seen.add(v);
    out[facet.key] = sortValues(facet.key, [...seen]);
  }
  return out;
}

const SIZE_ORDER = ['Small', 'Medium', 'Large', 'X-Large'];
function sortValues(key, values) {
  if (key === 'sizes') {
    return values.sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a);
      const bi = SIZE_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      const an = Number(a);
      const bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return a.localeCompare(b);
    });
  }
  return values.sort((a, b) => a.localeCompare(b));
}

function inBucket(price, b) {
  return price >= b.min && (b.max === Infinity ? true : price < b.max);
}

function matchesQuery(it, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    it.title.toLowerCase().includes(q) ||
    it.categories.some((t) => t.includes(q)) ||
    it.audiences.some((t) => t.includes(q)) ||
    it.colors.some((c) => c.toLowerCase().includes(q))
  );
}

/**
 * True if the item passes every facet group, optionally skipping one group
 * (used when computing that group's own faceted counts).
 */
function matchesFacets(it, filters, skip) {
  for (const facet of FACETS) {
    if (facet.key === skip) continue;
    const sel = filters[facet.key];
    if (sel.length && !facet.get(it).some((v) => sel.includes(v))) return false;
  }
  if (skip !== 'price' && filters.price.length) {
    const ok = filters.price.some((id) =>
      inBucket(it.price, PRICE_BUCKETS.find((b) => b.id === id)),
    );
    if (!ok) return false;
  }
  if (skip !== 'inStock' && filters.inStock && !it.available) return false;
  return true;
}

function toggle(filters, key, value) {
  const sel = filters[key];
  return {
    ...filters,
    [key]: sel.includes(value)
      ? sel.filter((v) => v !== value)
      : [...sel, value],
  };
}

function collectChips(filters) {
  const chips = [];
  for (const facet of FACETS) {
    for (const v of filters[facet.key]) {
      chips.push({key: facet.key, value: v, label: v});
    }
  }
  for (const id of filters.price) {
    const b = PRICE_BUCKETS.find((x) => x.id === id);
    chips.push({key: 'price', value: id, label: b ? b.label : id});
  }
  if (filters.inStock)
    chips.push({key: 'inStock', value: 'inStock', label: 'In stock'});
  return chips;
}

/** Split a title around the query match and wrap the hit in <mark>. */
function highlight(title, query) {
  const q = query.trim();
  if (!q) return title;
  const i = title.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return title;
  return (
    <>
      {title.slice(0, i)}
      <mark>{title.slice(i, i + q.length)}</mark>
      {title.slice(i + q.length)}
    </>
  );
}

const COLOR_HEX = {
  Green: '#3f8f4f',
  Olive: '#808000',
  Ocean: '#2b6cb0',
  Purple: '#7c3aed',
  Red: '#dc2626',
  Clay: '#b66a50',
  Jam: '#9b1c4b',
  Violet: '#7c3aed',
};

function now() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/* ------------------------------ small parts ------------------------------ */

function FacetGroup({label, values, counts, selected, onToggle, swatch}) {
  if (!values.length) return null;
  return (
    <fieldset className="is-group">
      <legend>{label}</legend>
      {values.map((v) => (
        <Check
          key={v}
          label={v}
          count={counts?.[v] ?? 0}
          checked={selected.includes(v)}
          onChange={() => onToggle(v)}
          dot={swatch ? COLOR_HEX[v] || '#bbb' : undefined}
        />
      ))}
    </fieldset>
  );
}

function Check({label, count, checked, onChange, dot}) {
  const disabled = count === 0 && !checked;
  return (
    <label className={`is-check${disabled ? ' is-check--off' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {dot && <span className="is-dot" style={{background: dot}} />}
      <span className="is-check-label">{label}</span>
      <span className="is-count">{count}</span>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * @typedef {{
 *   id: string; handle: string; title: string; image: string; alt: string;
 *   price: number; currency: string; available: boolean;
 *   categories: string[]; audiences: string[]; colors: string[]; sizes: string[];
 * }} Product
 */
