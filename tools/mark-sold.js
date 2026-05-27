#!/usr/bin/env node
// Local web UI for marking Depop items as sold (or un-sold) in Shopify.
//
// Run:    node mark-sold.js
// Open:   http://localhost:53683
//
// Paste a Depop product URL (or just the slug), click Mark Sold —
// it finds the matching Shopify product by SKU=`depop:<slug>`, sets the
// variant's inventory to 0, and adds the `sold` tag.

import http from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = 53683;
const API_VERSION = '2026-04';
const ENV_PATH = new URL('./.env', import.meta.url);

let env, locationId;

async function loadEnv() {
  const raw = await readFile(ENV_PATH, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.SHOPIFY_SHOP || !out.SHOPIFY_ACCESS_TOKEN) {
    throw new Error('tools/.env missing SHOPIFY_SHOP or SHOPIFY_ACCESS_TOKEN');
  }
  return out;
}

async function shopify(method, path, body) {
  const r = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}${path}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function shopifyGraphQL(query, variables) {
  const r = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors));
  return j.data;
}

function extractSlug(input) {
  const s = (input || '').trim();
  if (!s) return null;
  const m = s.match(/\/products\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : s.replace(/^\//, '');
}

async function findBySlug(slug) {
  const sku = `depop:${slug}`;
  const data = await shopifyGraphQL(
    `query($q: String!) {
       products(first: 5, query: $q) {
         edges { node {
           id legacyResourceId title status tags
           variants(first: 5) { edges { node {
             id legacyResourceId sku inventoryQuantity
             inventoryItem { id legacyResourceId }
           } } }
         } }
       }
     }`,
    { q: `sku:"${sku}"` }
  );
  for (const e of data.products.edges) {
    const node = e.node;
    for (const v of node.variants.edges) {
      if (v.node.sku === sku) {
        return {
          productId: node.legacyResourceId,
          title: node.title,
          status: node.status,
          tags: node.tags,
          variantId: v.node.legacyResourceId,
          inventoryItemId: v.node.inventoryItem.legacyResourceId,
          currentQty: v.node.inventoryQuantity,
        };
      }
    }
  }
  return null;
}

async function getLocationIdForItem(inventoryItemId) {
  // Avoids needing read_locations scope — pulls the existing inventory_level
  // record (which we have via read_inventory) and uses its location_id.
  const data = await shopify(
    'GET',
    `/inventory_levels.json?inventory_item_ids=${inventoryItemId}`
  );
  const lvl = data.inventory_levels?.[0];
  if (!lvl) throw new Error(`No inventory_level for item ${inventoryItemId}`);
  locationId = lvl.location_id;
  return locationId;
}

async function setInventory(inventoryItemId, available) {
  const locId = await getLocationIdForItem(inventoryItemId);
  return shopify('POST', '/inventory_levels/set.json', {
    location_id: locId,
    inventory_item_id: inventoryItemId,
    available,
  });
}

function updateTags(tags, add = [], remove = []) {
  // GraphQL returns tags as an array; REST as a comma-separated string.
  const list = Array.isArray(tags)
    ? tags
    : (tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const current = new Set(list);
  for (const t of remove) current.delete(t);
  for (const t of add) current.add(t);
  return [...current].join(', ');
}

async function markSold(slug, sold) {
  const found = await findBySlug(slug);
  if (!found) throw new Error(`No Shopify product found with SKU depop:${slug}`);
  await setInventory(found.inventoryItemId, sold ? 0 : 1);
  const newTags = sold
    ? updateTags(found.tags, ['sold'], [])
    : updateTags(found.tags, [], ['sold']);
  await shopify('PUT', `/products/${found.productId}.json`, {
    product: { id: Number(found.productId), tags: newTags },
  });
  return { ...found, newQty: sold ? 0 : 1, newTags };
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JCK · Mark Sold</title>
  <style>
    :root {
      --bg: #080808; --cream: #f7f4ef; --warm: #ede8e0;
      --muted: #9b9590; --tan: #c8b49a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 2rem 1rem; min-height: 100vh;
      background: var(--bg); color: var(--cream);
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      display: flex; flex-direction: column; align-items: center;
    }
    h1 {
      font-size: 2.5rem; letter-spacing: 0.2em; text-transform: uppercase;
      margin: 0 0 2rem; font-weight: 900;
    }
    .wrap { width: 100%; max-width: 640px; }
    textarea {
      width: 100%; min-height: 90px; padding: 1rem; resize: vertical;
      background: #111; color: var(--cream); border: 1px solid #2a2a2a;
      font-family: inherit; font-size: 1rem; letter-spacing: 0.02em;
    }
    textarea:focus { outline: 1px solid var(--tan); }
    .row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    button {
      flex: 1; padding: 1rem; cursor: pointer;
      background: var(--cream); color: var(--bg); border: 0;
      font-family: inherit; font-weight: 700; letter-spacing: 0.15em;
      text-transform: uppercase; font-size: 0.9rem;
    }
    button.secondary { background: #1a1a1a; color: var(--muted); border: 1px solid #2a2a2a; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .log { margin-top: 2rem; }
    .log-item {
      padding: 0.75rem; border-left: 2px solid var(--tan);
      background: #111; margin-bottom: 0.5rem; font-size: 0.85rem;
    }
    .log-item.error { border-color: #ff4444; }
    .log-item .title { color: var(--cream); font-weight: 700; }
    .log-item .meta { color: var(--muted); margin-top: 0.25rem; font-size: 0.75rem; }
    .hint { color: var(--muted); font-size: 0.8rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>Mark Sold</h1>
  <div class="wrap">
    <textarea id="input" placeholder="Paste Depop URL or slug — e.g. https://www.depop.com/products/jck_app9oved26-vintage-camel-joe-camel-graphic-0a3f/"></textarea>
    <p class="hint">Tip: you can paste multiple URLs at once, one per line.</p>
    <div class="row">
      <button id="sold">Mark Sold</button>
      <button id="unsold" class="secondary">Un-Mark</button>
    </div>
    <div id="log" class="log"></div>
  </div>
  <script>
    const $ = (s) => document.querySelector(s);
    const log = $('#log');
    function add(item) {
      const el = document.createElement('div');
      el.className = 'log-item' + (item.error ? ' error' : '');
      el.innerHTML = '<div class="title">' + (item.error ? '❌ ' : '✓ ') + (item.title || item.slug || 'unknown') + '</div>' +
        '<div class="meta">' + (item.error || ('inv=' + item.newQty + ' · ' + item.newTags)) + '</div>';
      log.prepend(el);
    }
    async function call(action) {
      const lines = $('#input').value.split('\\n').map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return;
      $('#sold').disabled = $('#unsold').disabled = true;
      try {
        for (const line of lines) {
          try {
            const r = await fetch('/api/mark', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: line, action }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
            add(j);
          } catch (e) { add({ slug: line, error: e.message }); }
        }
        $('#input').value = '';
      } finally {
        $('#sold').disabled = $('#unsold').disabled = false;
      }
    }
    $('#sold').addEventListener('click', () => call('sold'));
    $('#unsold').addEventListener('click', () => call('unsold'));
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'POST' && req.url === '/api/mark') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { input, action } = JSON.parse(body);
      const slug = extractSlug(input);
      if (!slug) throw new Error('Empty input');
      const result = await markSold(slug, action === 'sold');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        slug, title: result.title,
        newQty: result.newQty, newTags: result.newTags,
      }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    console.error(e);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

(async () => {
  env = await loadEnv();
  server.listen(PORT, () => {
    console.log(`\n  Mark-Sold UI:  http://localhost:${PORT}\n`);
    console.log('  Press Ctrl+C to stop.\n');
  });
})();
