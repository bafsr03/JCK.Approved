#!/usr/bin/env node
// Bulk-create Shopify products from tools/depop-listings.json.
//
// Each Shopify product is keyed by SKU=`depop:<slug>` so the importer is
// idempotent (re-runs skip listings already imported). Sold Depop items
// become active Shopify products with inventory=0 (visible but unavailable,
// renders the theme's "Sold out" badge).
//
// Usage (from inside tools/):
//   node import-depop-to-shopify.js --dry-run   # preview only, no API writes
//   node import-depop-to-shopify.js             # do it for real

import { readFile } from 'node:fs/promises';

const ENV_PATH = new URL('./.env', import.meta.url);
const LISTINGS_PATH = new URL('./depop-listings.json', import.meta.url);
const API_VERSION = '2026-04';
const DRY_RUN = process.argv.includes('--dry-run');

async function loadEnv() {
  const raw = await readFile(ENV_PATH, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.SHOPIFY_SHOP || !env.SHOPIFY_ACCESS_TOKEN) {
    throw new Error('tools/.env missing SHOPIFY_SHOP or SHOPIFY_ACCESS_TOKEN — run get-shopify-token.js first');
  }
  return env;
}

function makeClient(env) {
  const base = `https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}`;
  return async function api(method, path, body) {
    let attempt = 0;
    while (true) {
      attempt++;
      const r = await fetch(`${base}${path}`, {
        method,
        headers: {
          'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 429 || r.status === 503) {
        const retryAfter = Number(r.headers.get('retry-after')) || 2;
        console.warn(`  rate-limited (${r.status}); sleeping ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        if (attempt < 5) continue;
      }
      const text = await r.text();
      if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 500)}`);
      return text ? JSON.parse(text) : {};
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAllExistingSkus(api) {
  const skus = new Set();
  let pageInfo = null;
  let page = 0;
  while (true) {
    page++;
    const qs = new URLSearchParams({ limit: '250', fields: 'id,variants' });
    if (pageInfo) qs.set('page_info', pageInfo);
    const data = await api('GET', `/products.json?${qs.toString()}`);
    for (const p of data.products || []) {
      for (const v of p.variants || []) if (v.sku) skus.add(v.sku);
    }
    if (!data.products || data.products.length < 250) break;
    // Cursor pagination would normally come from Link header; for simplicity stop here
    // since stores starting at 0 products won't hit the 250-product page boundary.
    break;
  }
  return skus;
}

function buildProductPayload(listing, opts = {}) {
  const sku = `depop:${listing.slug}`;
  const title = listing.title?.trim() || listing.slug;
  const url = listing.url || `https://www.depop.com/products/${listing.slug}/`;
  const bodyHtml = [
    `<p>Originally listed on Depop.</p>`,
    `<p><a href="${url}" target="_blank" rel="noopener">View on Depop</a></p>`,
  ].join('\n');

  const price = listing.price != null ? Number(listing.price).toFixed(2) : '0.00';
  const inventoryQty = listing.sold ? 0 : 1;

  const tags = ['depop-import'];
  if (listing.sold) tags.push('sold');
  if (listing.reserved) tags.push('reserved');
  if (opts.priceSuspect) tags.push('price-suspect');

  return {
    product: {
      title,
      body_html: bodyHtml,
      vendor: 'JCK Approved',
      product_type: 'Curated',
      status: 'active',
      published: true,
      tags: tags.join(', '),
      images: listing.thumbnail ? [{ src: listing.thumbnail }] : [],
      variants: [
        {
          sku,
          price,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          inventory_quantity: inventoryQty,
          requires_shipping: true,
          taxable: true,
        },
      ],
      metafields: [
        { namespace: 'depop', key: 'slug', value: listing.slug, type: 'single_line_text_field' },
        { namespace: 'depop', key: 'url', value: url, type: 'url' },
        listing.sold ? { namespace: 'depop', key: 'sold_at_import', value: new Date().toISOString(), type: 'date_time' } : null,
      ].filter(Boolean),
    },
  };
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes ===' : '=== LIVE IMPORT ===');
  const env = await loadEnv();
  const api = makeClient(env);

  const file = JSON.parse(await readFile(LISTINGS_PATH, 'utf8'));
  const listings = file.listings || [];
  console.log(`Loaded ${listings.length} listings from depop-listings.json`);

  console.log('Fetching existing product SKUs from Shopify...');
  const existing = await fetchAllExistingSkus(api);
  console.log(`Found ${existing.size} existing SKUs.`);

  const priceCounts = {};
  for (const l of listings) if (l.price != null) priceCounts[l.price] = (priceCounts[l.price] || 0) + 1;
  const suspectPrices = new Set(
    Object.entries(priceCounts)
      .filter(([p, c]) => c >= 4 && Number(p) % 1 === 0)
      .map(([p]) => Number(p))
  );
  if (suspectPrices.size) {
    console.log(`Flagging suspect prices: ${[...suspectPrices].join(', ')}`);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    const sku = `depop:${l.slug}`;
    const tag = `[${i + 1}/${listings.length}]`;

    if (existing.has(sku)) {
      console.log(`${tag} skip (already imported): ${l.title}`);
      skipped++;
      continue;
    }

    const payload = buildProductPayload(l, { priceSuspect: suspectPrices.has(Number(l.price)) });

    if (DRY_RUN) {
      console.log(`${tag} would create: "${payload.product.title}" $${payload.product.variants[0].price} ${l.sold ? '[SOLD]' : '[active]'} — sku=${sku}`);
      created++;
      continue;
    }

    try {
      const resp = await api('POST', '/products.json', payload);
      const id = resp.product?.id;
      console.log(`${tag} created id=${id} "${payload.product.title}" ${l.sold ? '[SOLD inv=0]' : ''}`);
      created++;
      // Polite throttle: Shopify REST bucket is 2 req/s for Basic plans.
      await sleep(550);
    } catch (e) {
      console.error(`${tag} FAILED: ${l.slug}`);
      console.error(`  ${e.message}`);
      failed++;
    }
  }

  console.log('\n=== summary ===');
  console.log(`created: ${created}`);
  console.log(`skipped: ${skipped}`);
  console.log(`failed:  ${failed}`);
  if (DRY_RUN) console.log('(dry-run — nothing was actually written)');
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exit(1);
});
