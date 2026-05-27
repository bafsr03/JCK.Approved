// === JCK DEPOP SCRAPER (v3 — pure DOM, no detail fetches) ===
// Paste this entire file into the DevTools Console while on
//   https://www.depop.com/jck_approved26/
//
// v3 scrapes data directly from the rendered product cards on the shop page
// (Depop dropped __NEXT_DATA__ in detail pages, so v2's detail fetch is dead).
// We auto-scroll to load all listings, then for each card we extract:
//   - slug (from anchor href)
//   - title (best-effort from slug)
//   - thumbnail image (largest <img> in the card)
//   - price + currency (visible text)
//   - sold flag (if any "Sold" badge exists in the card)
//
// Output: depop-listings.json downloaded automatically.

(async () => {
  const SHOP = 'jck_approved26';
  const SCROLL_PAUSE = 700;
  const MAX_SCROLLS = 200;

  const log = (...a) => console.log('%c[depop]', 'color:#c8b49a;font-weight:bold', ...a);
  const warn = (...a) => console.warn('%c[depop]', 'color:#e0a000', ...a);

  // 1) Auto-scroll until height stabilizes.
  log('Auto-scrolling to load all listings...');
  let lastH = document.body.scrollHeight;
  let stable = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, SCROLL_PAUSE));
    const h = document.body.scrollHeight;
    if (h === lastH) {
      if (++stable >= 4) break;
    } else {
      stable = 0;
      lastH = h;
    }
    if ((i + 1) % 5 === 0) log(`scroll ${i + 1}× (height ${h}px)`);
  }
  window.scrollTo(0, 0);

  // 2) Find product anchors. Filter out /products/create and dedupe by slug.
  const anchors = [...document.querySelectorAll('a[href^="/products/"]')];
  log(`Found ${anchors.length} raw product anchors in DOM.`);

  // Walk up from each anchor to find the smallest container that holds image + price.
  // Depop's structure: <li> <a href="/products/..."><img/></a> ... price text somewhere ... </li>
  function findCard(anchor) {
    let el = anchor;
    for (let i = 0; i < 6 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      // Heuristic: a card has at least one img and contains price-looking text.
      const hasImg = !!el.querySelector('img');
      const hasPrice = /[$£€¥]\s?\d/.test(el.textContent || '');
      if (hasImg && hasPrice) return el;
    }
    return anchor.parentElement; // fallback
  }

  function bestImage(scope) {
    const imgs = [...scope.querySelectorAll('img')];
    if (!imgs.length) return null;
    // Prefer the largest by naturalWidth; fall back to first src
    let best = null;
    let bestW = -1;
    for (const img of imgs) {
      const w = img.naturalWidth || parseInt(img.width) || 0;
      const src = img.currentSrc || img.src || img.getAttribute('data-src');
      if (!src) continue;
      if (w > bestW) { bestW = w; best = src; }
    }
    return best;
  }

  function pricesIn(scope) {
    // Match "$12", "£12.50", "€1.234,56" etc.
    const text = scope.textContent || '';
    const re = /([$£€¥])\s?([0-9][0-9.,]*)/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      out.push({ symbol: m[1], amount: m[2], raw: m[0] });
    }
    return out;
  }

  function symbolToCurrency(s) {
    return ({ $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY' })[s] || 'USD';
  }

  function titleFromSlug(slug) {
    if (!slug) return 'Untitled';
    return slug
      .replace(/^[a-z0-9_]+-/i, '')              // strip leading username-prefix-
      .replace(/-[a-z0-9]{4,8}$/i, '')           // strip trailing random suffix
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || slug;
  }

  // 3) Walk every unique slug and grab a card for it.
  const bySlug = new Map();
  for (const a of anchors) {
    const m = a.getAttribute('href').match(/^\/products\/([^/?#]+)/);
    if (!m) continue;
    const slug = m[1];
    if (slug === 'create') continue; // the "Sell" button
    if (bySlug.has(slug)) continue;

    const card = findCard(a);
    if (!card) continue;

    const img = bestImage(card);
    const prices = pricesIn(card);
    const cardText = (card.textContent || '').toLowerCase();
    const sold = /\bsold\b/.test(cardText);
    const reserved = /\breserved\b/.test(cardText);

    // If two prices exist (original + discounted), assume the LAST one is current.
    const price = prices.length ? prices[prices.length - 1] : null;
    const original = prices.length > 1 ? prices[0] : null;

    bySlug.set(slug, {
      slug,
      url: `https://www.depop.com/products/${slug}/`,
      title: titleFromSlug(slug),
      thumbnail: img,
      price: price ? Number(price.amount.replace(/,/g, '')) : null,
      currency: price ? symbolToCurrency(price.symbol) : 'USD',
      original_price: original ? Number(original.amount.replace(/,/g, '')) : null,
      sold,
      reserved,
    });
  }

  const listings = [...bySlug.values()];
  log(`Extracted ${listings.length} unique listings from cards.`);

  // 4) Heuristic: warn if many slugs don't look like they belong to this shop.
  const shopPrefix = SHOP.toLowerCase().replace(/_/g, '');
  const looksMine = (s) => {
    const stripped = s.toLowerCase().replace(/_/g, '');
    return stripped.startsWith(shopPrefix.slice(0, 6)); // tolerate typos in first chars
  };
  const foreign = listings.filter((l) => !looksMine(l.slug));
  if (foreign.length) {
    warn(`${foreign.length} listings have slugs that don't start with "${SHOP}". These may be cross-shop recommendations. First few:`, foreign.slice(0, 3).map((l) => l.slug));
  }

  // 5) Stats.
  const withPrice = listings.filter((l) => l.price != null).length;
  const withImg = listings.filter((l) => l.thumbnail).length;
  const soldCount = listings.filter((l) => l.sold).length;
  log(`stats: priced=${withPrice}/${listings.length}, withImage=${withImg}, sold=${soldCount}`);

  // 6) Download.
  const out = {
    shop: SHOP,
    fetched_at: new Date().toISOString(),
    count: listings.length,
    listings,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'depop-listings.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  log('Downloaded depop-listings.json — move it to tools/ in the theme repo.');
  window.__jckDepop = out;
})();
