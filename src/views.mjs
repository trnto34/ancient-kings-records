import { bandcampFormatArt, bandcampSnapshotDate } from './bandcamp.mjs';
import { html } from 'hono/html';
import { BRAND, BANDCAMP, DESCRIPTION, CATEGORIES, FORMATS, GENRES, SAMPLE_ART, countryLabel, dateLabel, money } from './config.mjs';
import { cartTotal, maxQuantity, productImages } from './shop.mjs';

const headerLinks = [['/store', 'Store'], ['/discography', 'Discography'], ['/artists', 'Artists'], ['/news', 'News'], ['/about', 'About']];
const footerLinks = [['/contact', 'Contact'], ['/shipping', 'Shipping & returns'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];
const searchIcon = html`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m15.5 15.5 4.5 4.5" stroke="currentColor" stroke-width="1.5"/></svg>`;
const accountIcon = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" stroke="currentColor" stroke-width="1.5"/></svg>`;
const bagIcon = html`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14l2 14H3L5 7Z" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 9V6a3.5 3.5 0 1 1 7 0v3" stroke="currentColor" stroke-width="1.5"/></svg>`;

export function brand() {
  return html`<a class="brand" href="/" aria-label="${BRAND} home">
    <img class="label-crest" src="/assets/bandcamp-crest.webp" alt="" width="42" height="42">
    <span class="brand-name">Ancient King <span>Records</span></span>
  </a>`;
}

function navigation() {
  return headerLinks.map(([href, label]) => html`<a href="${href}">${label}</a>`);
}

function footer(c) {
  const signup = c.req.query('newsletter');
  return html`<footer>
    <section id="newsletter" class="newsletter">
      <div class="shell newsletter-layout">
        <div><h2>Release notices</h2><p>New releases, restocks and label news by email.</p></div>
        <form method="post" action="/newsletter" class="subscribe">
          <label class="visually-hidden" for="newsletter-email">Email address</label>
          <div class="inline-field"><input id="newsletter-email" type="email" name="email" autocomplete="email" placeholder="Email address" required maxlength="254">
            <button class="button button-primary" type="submit">Subscribe</button></div>
          ${signup === 'ok' ? html`<p class="form-feedback" role="status">You’re on the list.</p>` : ''}
          ${signup === 'error' ? html`<p class="form-feedback" role="alert">Enter a valid email address and try again.</p>` : ''}
        </form>
      </div>
    </section>
    <div class="shell footer-grid">
      <div>${brand()}<p>Independent record label and underground distribution.</p></div>
      <nav aria-label="Explore"><h2>Explore</h2>${[['/store', 'Store'], ['/discography', 'Discography'], ['/artists', 'Artists'], ['/about', 'About the label'], [BANDCAMP, 'Bandcamp']].map(([href, text]) => html`<a href="${href}">${text}</a>`)}</nav>
      <nav aria-label="Help"><h2>Help</h2>${footerLinks.map(([href, text]) => html`<a href="${href}">${text}</a>`)}</nav>
    </div>
    <div class="shell footer-bottom"><small>© ${new Date().getFullYear()} ${BRAND}</small></div>
  </footer>`;
}

export function layout(c, options, content) {
  const { title, description = DESCRIPTION, artwork = '/assets/ruins.webp', noindex = false, path = c.req.path } = options;
  const pageTitle = title ? `${title} | ${BRAND}` : `${BRAND} | Underground Record Store`;
  const origin = c.get('shop').origin;
  const socialImage = artwork.startsWith('/') && origin ? origin + artwork : artwork;
  const cartCount = [...c.get('cart').values()].reduce((sum, count) => sum + count, 0);
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#080808">
  ${noindex ? html`<meta name="robots" content="noindex, follow">` : ''}
  ${origin && !noindex ? html`<link rel="canonical" href="${origin + path}"><meta property="og:url" content="${origin + path}">` : ''}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${socialImage}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/bandcamp-crest.webp" type="image/webp">
  <link rel="preload" href="/assets/barlow-condensed-latin-900-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/site.css?v=4">
  <script src="/assets/site.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="shell header-layout">
      <details class="mobile-menu"><summary aria-label="Menu"><span class="menu-bars"></span></summary><nav aria-label="Mobile navigation">${navigation()}</nav></details>
      ${brand()}
      <nav class="main-nav" aria-label="Main navigation">${navigation()}</nav>
      <div class="header-tools">
        <a href="/store?search=1" class="tool-link" data-open-search aria-label="Search">${searchIcon}</a>
        <a href="/account" class="tool-link" aria-label="Account">${accountIcon}</a>
        <a href="/cart" class="tool-link cart-link" aria-label="Cart, ${cartCount} items" data-cart-link>${bagIcon}<span class="cart-count" data-cart-count>${cartCount}</span></a>
      </div>
    </div>
  </header>
  <main id="main">${content}</main>
  ${footer(c)}
  <dialog id="search-dialog" aria-labelledby="search-title" class="dialog"><div class="dialog-head"><h2 id="search-title">Search the catalogue</h2><form method="dialog"><button class="icon-button" aria-label="Close search">×</button></form></div>
    <form method="get" action="/store" class="inline-field"><label class="visually-hidden" for="site-search">Artist, title or format</label><input id="site-search" name="q" type="search" autofocus required maxlength="120" placeholder="Artist, title or format"><button class="button button-primary">Search</button></form>
  </dialog>
  <dialog id="quick-dialog" aria-label="Product quick view" class="dialog quick-dialog"><div class="dialog-head"><span>Quick view</span><form method="dialog"><button class="icon-button" aria-label="Close quick view">×</button></form></div><div data-quick-content></div></dialog>
  <div class="notice-pop" data-notice role="status" aria-live="polite"></div>
</body></html>`;
}

export function breadcrumbs(...items) {
  return html`<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a>${items.map(([href, label]) => html`<span aria-hidden="true">/</span>${href ? html`<a href="${href}">${label}</a>` : html`<span aria-current="page">${label}</span>`}`)}</nav>`;
}

export function message(c, title, text, status = 400, href = '/store', link = 'Browse the store') {
  return c.html(layout(c, { title, noindex: true }, html`<div class="shell page-spaced narrow">
    <h1>${title}</h1><p>${text}</p><a class="button button-primary" href="${href}">${link}</a>
  </div>`), status);
}

export function stockLabel(item) {
  const label = item.bandcamp_url ? {
    available: 'Listed in stock', 'sold-out': 'Sold out', preorder: 'Pre-order', listen: 'Stream / download',
  }[item.bandcamp_state] : (item.stock ? 'In stock' : 'Sold out');
  const soldOut = item.bandcamp_url ? item.bandcamp_state === 'sold-out' : !item.stock;
  return html`<span class="stock ${soldOut ? 'out-stock' : 'in-stock'}">${label}</span>`;
}

function price(item, currency) {
  if (item.bandcamp_url) {
    const label = item.bandcamp_price_mode === 'source' ? 'See Bandcamp'
      : item.bandcamp_price_mode === 'minimum' && !item.price_cents ? 'Name your price'
      : `${item.bandcamp_price_mode === 'minimum' ? 'From ' : ''}${money(item.price_cents, 'EUR')}`;
    return html`<span class="price">${label}</span>`;
  }
  return html`<span class="price">${item.list_cents ? html`<s>${money(item.list_cents, currency)}</s>` : ''}${money(item.price_cents, currency)}</span>`;
}

function addForm(item, next, quantity = false) {
  if (item.bandcamp_url) {
    const label = item.bandcamp_kind === 'digital' && item.bandcamp_price_mode === 'source' ? 'Listen on Bandcamp'
      : item.bandcamp_state === 'sold-out' ? 'View on Bandcamp' : quantity ? 'Buy on Bandcamp' : 'Bandcamp';
    return html`<a class="button ${quantity ? 'button-primary' : 'button-card'}" href="${item.bandcamp_url}">${label}</a>`;
  }
  return html`<form method="post" action="/cart/add" class="add-form" data-add-form>
    <input type="hidden" name="slug" value="${item.slug}">
    <input type="hidden" name="next" value="${next}">
    ${quantity ? html`<label>Quantity<input type="number" name="quantity" value="1" min="1" max="${Math.min(item.stock || 1, maxQuantity)}" ${item.stock ? '' : 'disabled'} required></label>` : html`<input type="hidden" name="quantity" value="1">`}
    <button type="submit" class="button ${quantity ? 'button-primary' : 'button-card'}" ${item.stock ? '' : 'disabled'}>${item.stock ? 'Add to cart' : 'Sold out'}</button>
  </form>`;
}

export function productCard(item, currency, next) {
  const url = `/products/${item.slug}`;
  return html`<article class="product-card">
    <a class="cover-link${item.bandcamp_kind === 'physical' ? ' cover-link-edition' : ''}" href="${url}" aria-label="${item.title}">
      <img src="${item.bandcamp_thumbnail || productImages(item)[0]}" alt="" loading="lazy" width="512" height="512">
      ${item.sample ? html`<span class="sample-tag">Sample</span>` : ''}
    </a>
    <div class="product-card-body">
      <p class="artist-name">${item.artist || item.label || BRAND}</p>
      <h3><a href="${url}">${item.title}</a></h3>
      <div class="card-meta"><span>${item.format}</span>${price(item, currency)}</div>
      ${stockLabel(item)}
      <div class="card-actions"><a class="button button-quiet" data-quick-view="${url}/quick" href="${url}">Quick view</a>${addForm(item, next)}</div>
    </div>
  </article>`;
}

export function productGrid(items, currency, next) {
  return html`<div class="product-grid">${items.map(item => productCard(item, currency, next))}</div>`;
}

export function home(c, arrivals, featured) {
  const { currency } = c.get('shop');
  const spotlight = featured.find(item => item.bandcamp_kind === 'physical');
  return layout(c, {}, html`
    <section class="hero catalogue-hero" aria-labelledby="hero-title">
      <picture class="hero-image"><source media="(max-width: 680px)" srcset="/assets/ruins-mobile.webp"><img src="/assets/ruins.webp" alt="" width="1680" height="560"></picture>
      <div class="shell hero-layout">
        <div class="hero-content"><p class="eyebrow">Independent label · France</p>
          <h1 id="hero-title" class="visually-hidden">Ancient King Records</h1>
          <img class="label-wordmark" src="/assets/bandcamp-wordmark.webp" alt="" width="410" height="180" fetchpriority="high">
          <p>Dungeon synth, medieval and fantasy music on tape, CD and vinyl.</p>
          <div class="hero-actions"><a href="/store" class="button button-primary">Browse the armory</a><a href="${BANDCAMP}/music" class="button button-outline">Listen on Bandcamp</a></div>
        </div>
        ${spotlight ? html`<a class="hero-record" href="/products/${spotlight.slug}">
          <img src="${productImages(spotlight)[0]}" alt="" width="512" height="512" fetchpriority="high">
          <span class="hero-record-caption"><span><small>${spotlight.artist || BRAND}</small><strong>${spotlight.title}</strong></span><span>${spotlight.format}</span></span>
        </a>` : ''}
      </div>
    </section>
    <nav class="format-nav" aria-label="Shop by format"><div class="shell format-nav-inner">
      ${CATEGORIES.filter(([slug]) => ['all-releases', 'vinyl-lps', 'cds', 'cassettes', 'merchandise', 'zines-and-publications', 'digital-releases', 'distribution'].includes(slug)).map(([slug, name]) =>
        html`<a href="/store/${slug}">${name}</a>`)}
    </div></nav>
    <section class="shell section-space" aria-labelledby="arrivals-title">
      <div class="section-head"><div><h2 id="arrivals-title">New in the Armory</h2>${arrivals.some(item => item.sample) ? html`<p>Sample listings for the catalogue preview.</p>` : ''}</div>
        <a class="text-link" href="/store/new-arrivals">View all arrivals</a></div>
      ${arrivals.length ? productGrid(arrivals, currency, '/') : html`<p class="empty">New releases will appear here when they’re added.</p>`}
    </section>
    ${featured.length ? html`<section id="featured" class="featured" aria-labelledby="featured-title">
      <div class="shell section-space"><div class="section-head"><h2 id="featured-title">Featured Editions</h2><a class="text-link" href="/discography">Label discography</a></div>
        <div class="featured-grid">${featured.map(item => html`<article class="featured-item">
          <a href="/products/${item.slug}" tabindex="-1"><img src="${productImages(item)[0]}" alt="" width="512" height="512" loading="lazy"></a>
          <div class="featured-copy"><p class="eyebrow">${item.sample ? 'Sample release' : item.format}</p><h3><a href="/products/${item.slug}">${item.title}</a></h3>
          <p>${item.artist || BRAND}</p><a class="text-link" href="/products/${item.slug}">Release details</a></div></article>`)}
        </div>
      </div></section>` : ''}
    <section class="shell section-space" aria-labelledby="format-title"><div class="section-head"><h2 id="format-title">Browse by Format</h2></div>
      <div class="format-grid">${FORMATS.map(([slug, name, art]) => html`<a class="format-tile" href="/store/${slug}"><img src="${bandcampFormatArt(slug) ?? `/assets/${art}`}" alt="" width="512" height="512" loading="lazy"><span>${name}</span></a>`)}</div>
    </section>
    <section class="philosophy"><div class="shell philosophy-copy"><h2>About the Label</h2>
      <p>Ancient King Records is an independent label and distro dedicated to underground music, independent artists and physical editions. Based in Nouvelle-Aquitaine, France, the label releases dungeon synth and music shaped by medieval and fantasy traditions.</p>
      <a class="text-link" href="/about">About the label</a>
    </div></section>`);
}

export function store(c, category, allCategories, filters, results) {
  const { currency } = c.get('shop');
  const { q, genre, available, sort } = filters;
  const { items, total, pages, current } = results;
  const path = `/store/${category.slug}`;
  const title = category.rule === 'all' ? 'Record Store' : category.name;
  const url = new URL(c.req.url);
  const next = url.pathname + url.search;
  const pageUrl = page => {
    const params = new URLSearchParams(url.search);
    params.delete('search');
    params.set('page', page);
    return `${path}?${params}`;
  };
  return layout(c, { title, path, noindex: Boolean(q || genre || available), description: category.description }, html`
    <section class="page-banner"><div class="shell">${breadcrumbs(...(category.rule === 'all' ? [[null, 'Store']] : [['/store', 'Store'], [null, category.name]]))}
      <div class="page-heading"><h1>${title}</h1><p>${category.description}</p></div>
    </div></section>
    <div class="shell catalogue-layout">
      <aside class="catalogue-nav"><h2>Categories</h2><nav aria-label="Catalogue categories">
        ${allCategories.map(group => html`<a href="/store/${group.slug}" aria-current="${group.slug === category.slug ? 'page' : 'false'}">${group.name}</a>`)}
      </nav></aside>
      <section class="catalogue-results" aria-label="Catalogue results">
        <form method="get" action="${path}" class="filter-form">
          <label class="filter-search">Search<input type="search" name="q" value="${q}" placeholder="Artist, title or format" maxlength="120" ${c.req.query('search') ? 'autofocus' : ''}></label>
          <label>Genre<select name="genre"><option value="">All genres</option>
            ${GENRES.map(name => html`<option value="${name}" ${genre === name ? 'selected' : ''}>${name}</option>`)}
          </select></label>
          <label>Sort by<select name="sort">
            ${[['newest', 'Newest'], ['oldest', 'Oldest'], ['price-asc', 'Price, low to high'], ['price-desc', 'Price, high to low']].map(([value, name]) => html`<option value="${value}" ${sort === value ? 'selected' : ''}>${name}</option>`)}
          </select></label>
          <label class="checkbox"><input type="checkbox" name="available" value="1" ${available ? 'checked' : ''}>In stock</label>
          <button class="button button-primary">Apply</button>
        </form>
        <div class="results-meta"><p>${total} ${total === 1 ? 'item' : 'items'}${q ? html` matching <strong>“${q}”</strong>` : ''}${items.some(item => item.sample) ? ' · Sample listings included' : items.some(item => item.bandcamp_url) ? ' · Bandcamp catalogue' : ''}</p>
          ${q || genre || available || sort !== 'newest' ? html`<a href="${path}">Clear filters</a>` : ''}</div>
        ${items.length ? productGrid(items, currency, next) :
          html`<div class="empty"><h2>No matching items</h2><p>Try a different search or browse the full catalogue.</p><a class="text-link" href="/store">All releases</a></div>`}
        ${pages > 1 ? html`<nav class="pagination" aria-label="Catalogue pages">
          ${current > 1 ? html`<a class="button button-outline" rel="prev" href="${pageUrl(current - 1)}">Previous</a>` : ''}
          <span>Page ${current} of ${pages}</span>
          ${current < pages ? html`<a class="button button-outline" rel="next" href="${pageUrl(current + 1)}">Next</a>` : ''}
        </nav>` : ''}
      </section>
    </div>`);
}

function productSummary(c, item, expanded) {
  const { currency } = c.get('shop');
  return html`
    ${item.sample ? html`<p class="eyebrow">Sample listing</p>` : ''}
    <p class="artist-name detail-artist">${item.artist_slug ? html`<a href="/artists/${item.artist_slug}">${item.artist}</a>` : (item.label || BRAND)}</p>
    ${expanded ? html`<h1>${item.title}</h1>` : html`<h2>${item.title}</h2>`}
    <p class="detail-format">${item.format}${item.genre ? ` · ${item.genre}` : ''}</p>
    <div class="detail-price">${price(item, currency)}${stockLabel(item)}</div>
    ${addForm(item, `/products/${item.slug}`, true)}
    ${item.bandcamp_url ? html`<p class="muted bandcamp-note">Catalogue snapshot from <time datetime="${bandcampSnapshotDate}">${dateLabel(bandcampSnapshotDate)}</time>. Bandcamp shows current prices and availability.</p>` : ''}
    ${item.bandcamp_kind === 'digital' && item.bandcamp_artist_url && item.bandcamp_artist_url !== item.bandcamp_url
      ? html`<p><a class="text-link" href="${item.bandcamp_artist_url}">Support the artist directly</a></p>` : ''}
    ${item.sample ? html`<p class="muted">Sample artwork, price and stock. This listing is for browsing only.</p>` : ''}
  `;
}

export function quickView(c, item) {
  return html`<div class="quick-product">
    <img src="${productImages(item)[0]}" alt="${item.title} artwork" width="512" height="512">
    <div>${productSummary(c, item, false)}<a class="text-link" href="/products/${item.slug}">Full release details</a></div>
  </div>`;
}

export function productPage(c, item) {
  const images = productImages(item);
  const tracks = item.tracklist.split('\n').filter(Boolean);
  const options = item.bandcamp_options ? JSON.parse(item.bandcamp_options) : [];
  return layout(c, { title: item.title, description: item.description.slice(0, 160) || undefined, artwork: images[0], noindex: Boolean(item.sample) }, html`
    <div class="shell page-spaced">
      ${breadcrumbs(['/store', 'Store'], [null, item.title])}
      ${c.req.query('added') === '1' ? html`<p class="form-feedback" role="status">Added to your cart. <a href="/cart">View cart</a></p>` : ''}
      <div class="product-detail">
        <div class="release-gallery">
          <a data-main-art-link href="${images[0]}"><img data-main-art src="${images[0]}" alt="${item.title} artwork" width="512" height="512" fetchpriority="high"></a>
          ${images.length > 1 ? html`<div class="thumbnails" aria-label="Additional artwork">${images.map((image, index) => html`<a href="${image}" data-gallery-image aria-label="Artwork image ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"><img src="${image}" alt="" width="72" height="72" loading="lazy"></a>`)}</div>` : ''}
        </div>
        <section class="release-summary">
          ${productSummary(c, item, true)}
          <dl class="release-facts">
            <div><dt>Format</dt><dd>${item.format}</dd></div>
            ${options.length ? html`<div><dt>${item.bandcamp_option_name || 'Options'}</dt><dd>${options.join(', ')}</dd></div>` : ''}
            ${item.label ? html`<div><dt>Label</dt><dd>${item.label}</dd></div>` : ''}
            ${item.release_date ? html`<div><dt>Release date</dt><dd><time datetime="${item.release_date}">${dateLabel(item.release_date)}</time></dd></div>` : ''}
            ${item.catalogue_number ? html`<div><dt>Catalogue number</dt><dd>${item.catalogue_number}</dd></div>` : ''}
          </dl>
          <a class="text-link" href="${item.bandcamp_url || '/shipping'}">${item.bandcamp_url ? 'Listing details on Bandcamp' : 'Shipping & returns'}</a>
        </section>
      </div>
      <div class="release-notes">
        <section><h2>${item.bandcamp_kind === 'physical' && !item.bandcamp_album ? 'About this item' : 'About this release'}</h2><p class="preserve-lines">${item.description || 'See the original Bandcamp listing for release notes and credits.'}</p>
          ${/^\d{1,16}$/.test(item.bandcamp_album) ? html`<iframe class="bandcamp" title="Listen to ${item.title} on Bandcamp" loading="lazy" src="https://bandcamp.com/EmbeddedPlayer/album=${item.bandcamp_album}/size=small/bgcol=333333/linkcol=e3bc85/transparent=true/"></iframe>` : ''}</section>
        ${tracks.length ? html`<section><h2>Tracklist</h2><ol class="tracklist">${tracks.map(track => html`<li>${track}</li>`)}</ol></section>` : ''}
      </div>
    </div>`);
}

function checkoutSummary(c, items, destination, attempt, openOrder) {
  const { currency, rates, checkout, test } = c.get('shop');
  const sample = items.some(item => item.sample);
  const unavailable = items.some(item => item.missing || item.quantity > item.stock);
  const countries = Object.keys(rates).sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  const shipping = rates[destination];
  const hasShipping = shipping !== undefined;
  return html`<aside class="order-summary"><h2>Order summary</h2>
    <dl><div><dt>Subtotal</dt><dd>${money(cartTotal(items), currency)}</dd></div>
    <div><dt>Shipping</dt><dd>${hasShipping ? money(shipping, currency) : countries.length ? 'Select a destination' : 'Rate pending'}</dd></div>
    ${hasShipping ? html`<div class="order-total"><dt>Estimated total</dt><dd>${money(cartTotal(items) + shipping, currency)}</dd></div>` : ''}</dl>
    ${countries.length ? html`<form method="get" action="/cart" class="quote-form"><label>Ship to<select name="country" required>
      <option value="">Choose a country</option>${countries.map(country => html`<option value="${country}" ${country === destination ? 'selected' : ''}>${countryLabel(country)}</option>`)}</select></label>
      <button class="button button-outline">Calculate shipping</button></form>` : ''}
    ${openOrder ? html`<form method="post" action="/checkout" class="checkout-form">
      <input type="hidden" name="attempt" value="${attempt}"><input type="hidden" name="country" value="${openOrder.country}">
      <button class="button button-primary">Resume checkout</button>
      <p class="muted">Your saved checkout is linked to this cart.</p>
    </form>` : checkout && hasShipping && !sample && !unavailable ? html`<form method="post" action="/checkout" class="checkout-form">
      <input type="hidden" name="attempt" value="${attempt}"><input type="hidden" name="country" value="${destination}">
      <button class="button button-primary">Continue to secure checkout</button><p class="muted">${test ? 'Stripe test mode. No real charge will be made.' : 'Enter your delivery details and pay on Stripe.'}</p>
    </form>` : html`<p class="checkout-unavailable">${sample ? 'Sample items are unavailable for purchase.' : unavailable ? 'Remove unavailable items or adjust their quantities.' : checkout ? 'Choose a destination to continue.' : 'Checkout is currently unavailable.'}</p>`}
  </aside>`;
}

export function cartPage(c, items, destination, attempt, openOrder) {
  const { currency } = c.get('shop');
  return layout(c, { title: 'Your Cart', noindex: true }, html`<div class="shell page-spaced">
    ${breadcrumbs([null, 'Cart'])}<div class="page-heading"><h1>Your cart</h1></div>
    ${c.req.query('cancelled') ? html`<p class="form-feedback" role="status">Checkout closed. Your items are still in the cart.</p>` : ''}
    ${items.length ? html`<div class="cart-layout">
      <ul class="cart-items">${items.map(item => html`<li class="cart-item">
        ${item.missing ? '' : html`<a href="/products/${item.slug}" aria-label="${item.title}"><img src="${productImages(item)[0]}" alt="" width="112" height="112"></a>`}
        <div class="cart-item-copy"><h2>${item.missing ? item.title : html`<a href="/products/${item.slug}">${item.title}</a>`}</h2>
          <p>${item.sample ? 'Sample · ' : ''}${item.format || 'No longer in the catalogue'}</p>
          ${item.quantity > item.stock ? html`<p class="error-text">${openOrder ? 'Inventory held for checkout.' : 'Requested quantity is unavailable.'}</p>` : ''}
          <form method="post" action="/cart/update" class="quantity-form"><input type="hidden" name="id" value="${item.id}">
            ${item.missing || !item.stock ? '' : html`<label class="visually-hidden" for="qty-${item.id}">Quantity for ${item.title}</label><input id="qty-${item.id}" name="quantity" aria-label="Quantity for ${item.title}" type="number" min="1" max="${Math.min(item.stock, maxQuantity)}" value="${Math.min(item.quantity, item.stock)}" required><button class="button button-quiet">Update</button>`}
            <button class="text-button" name="remove" value="1" formnovalidate>Remove</button></form>
        </div><span class="cart-item-total">${item.missing ? '' : money(item.price_cents * item.quantity, currency)}</span>
      </li>`)}</ul>
      ${checkoutSummary(c, items, destination, attempt, openOrder)}
    </div>` : html`<div class="empty"><h2>Your cart is empty</h2><p>Browse the catalogue to find your next release.</p><a class="button button-primary" href="/store">Enter the store</a></div>`}
  </div>`);
}

const orderHeadings = { pending: 'Payment pending', paid: 'Order confirmed', shipped: 'Order shipped', expired: 'Checkout expired' };

export function orderPage(c, order, lines) {
  const title = orderHeadings[order.status];
  return layout(c, { title, noindex: true }, html`<div class="shell page-spaced narrow">
    ${breadcrumbs(['/cart', 'Cart'], [null, title])}<h1>${title}</h1>
    <p>${order.status === 'pending' ? 'We’re waiting for Stripe to confirm your payment. Refresh this page to check the status.' : order.status === 'expired' ? 'The payment window has closed. Return to the cart to start a new checkout.' : 'Stripe has confirmed the payment.'}${order.test ? ' This was a Stripe test order.' : ''}</p>
    <section class="order-summary"><h2>Order ${order.id.slice(0, 10).toUpperCase()}</h2>
      <dl>${lines.map(line => html`<div><dt>${line.quantity} × ${line.title}</dt><dd>${money(line.quantity * line.unit_cents, order.currency)}</dd></div>`)}
        <div><dt>Shipping</dt><dd>${money(order.shipping_cents, order.currency)}</dd></div>
        <div class="order-total"><dt>Total</dt><dd>${money(order.paid_total_cents ?? order.subtotal_cents + order.shipping_cents, order.currency)}</dd></div>
      </dl></section>
    <a class="button button-outline" href="${order.status === 'expired' ? '/cart' : '/store'}">${order.status === 'expired' ? 'Return to cart' : 'Continue browsing'}</a>
  </div>`);
}

export function accountPage(c, account, orders = [], error = '', registering = c.req.query('register') === '1') {
  const title = account ? 'Your account' : registering ? 'Create an account' : 'Customer sign in';
  return layout(c, { title, noindex: true }, html`<div class="shell page-spaced narrow">
    ${breadcrumbs([null, 'Account'])}<h1>${title}</h1>
    ${account ? html`<p>${account.email}</p>
      <form method="post" action="/account/logout"><button class="button button-outline">Sign out</button></form>
      <section class="account-orders"><h2>Order history</h2>
      ${orders.length ? html`<ul class="order-list">${orders.map(order => html`<li><a href="/orders/${order.access_token}">Order ${order.id.slice(0, 10).toUpperCase()}</a>
        <span>${dateLabel(order.created_at)}</span><span>${orderHeadings[order.status]}</span><span>${money(order.paid_total_cents ?? order.subtotal_cents + order.shipping_cents, order.currency)}</span></li>`)}</ul>` :
        html`<p>Your orders will appear here when you check out while signed in.</p>`}</section>
    ` : html`
      <p>Sign in to view orders placed with your account.</p>
      ${error ? html`<p class="form-feedback error-text" role="alert">${error}</p>` : ''}
      <form class="stacked-form" method="post" action="/account/${registering ? 'register' : 'login'}">
        <label>Email address<input type="email" name="email" autocomplete="email" required maxlength="254"></label>
        <label>Password<input type="password" name="password" autocomplete="${registering ? 'new-password' : 'current-password'}" required minlength="${registering ? 12 : 1}" maxlength="128"></label>
        ${registering ? html`<p class="muted">Use at least 12 characters.</p>` : ''}
        <button class="button button-primary">${registering ? 'Create account' : 'Sign in'}</button>
      </form>
      <p><a class="text-link" href="/account${registering ? '' : '?register=1'}">${registering ? 'Back to sign in' : 'Create an account'}</a></p>`}
  </div>`);
}

export function editorial(c, title, introduction, body, options = {}) {
  return layout(c, { title, ...options }, html`<section class="page-banner"><div class="shell">${breadcrumbs([null, title])}
    <div class="page-heading"><h1>${title}</h1>${introduction ? html`<p>${introduction}</p>` : ''}</div></div></section>
    <div class="shell page-spaced editorial">${body}</div>`);
}

function artistCard(artist) {
  return html`<article class="artist-card"><a href="/artists/${artist.slug}"><img src="${artist.artwork || SAMPLE_ART}" alt="" width="512" height="512" loading="lazy"></a>
    <div><h3><a href="/artists/${artist.slug}">${artist.name}</a></h3>${artist.sample ? html`<p>Sample profile</p>` : ''}</div>
  </article>`;
}

export function artistDirectory(c, artists) {
  return editorial(c, 'Artists', 'Artists in the label and distribution catalogue.', artists.length ?
    html`<div class="artist-grid">${artists.map(artistCard)}</div>` :
    html`<p class="empty">Artist profiles will appear here as the catalogue grows.</p>`);
}

export function artistPage(c, artist, products, related) {
  const { currency } = c.get('shop');
  return layout(c, { title: artist.name, description: artist.bio.slice(0, 160), artwork: artist.artwork || SAMPLE_ART, noindex: Boolean(artist.sample) }, html`
    <div class="shell page-spaced">
      ${breadcrumbs(['/artists', 'Artists'], [null, artist.name])}
      <div class="artist-profile"><img src="${artist.artwork || SAMPLE_ART}" alt="" width="512" height="512"><div>
        ${artist.sample ? html`<p class="eyebrow">Sample profile</p>` : ''}<h1>${artist.name}</h1>
        <p class="preserve-lines">${artist.bio || 'Biography forthcoming.'}</p>
        ${artist.listening_url ? html`<a class="button button-outline" href="${artist.listening_url}" rel="noopener noreferrer">Listen & follow</a>` : ''}
      </div></div>
      <section class="section-space"><div class="section-head"><h2>Releases</h2></div>${products.length ? productGrid(products, currency, c.req.path) : html`<p>No catalogue releases yet.</p>`}</section>
      ${related.length ? html`<section class="section-space"><div class="section-head"><h2>Related artists</h2></div><div class="artist-grid">${related.map(artistCard)}</div></section>` : ''}
    </div>`);
}

export function discography(c, products) {
  const years = Map.groupBy(products, item => item.release_date.slice(0, 4));
  return editorial(c, 'Discography', 'Releases from Ancient King Records, ordered by release date.', html`
    ${!products.length ? html`<p class="empty">Confirmed releases will appear here.</p>` : ''}
    ${products.some(item => item.sample) ? html`<p>Sample entries illustrate the discography layout.</p>` : ''}
    ${[...years].map(([year, items]) => html`<section class="discography-year"><h2>${year}</h2><ul>
      ${items.map(item => html`<li><a href="/products/${item.slug}"><img src="${productImages(item)[0]}" alt="" width="72" height="72" loading="lazy">
        <span><strong>${item.title}</strong><span>${item.artist || item.format}${item.sample ? ' · Sample' : ''}</span></span>
        <span class="catalogue-number">${item.catalogue_number}</span><time datetime="${item.release_date}">${dateLabel(item.release_date)}</time></a></li>`)}
    </ul></section>`)}`);
}

export function contactPage(c, error = '') {
  return editorial(c, 'Contact', 'Get in touch about releases, distribution or orders.', html`
    <div class="prose">
      ${c.req.query('sent') === '1' ? html`<p class="form-feedback" role="status">Your message has been received.</p>` : ''}
      ${error ? html`<p class="form-feedback error-text" role="alert">${error}</p>` : ''}
      <form method="post" action="/contact" class="stacked-form">
        <label>Name<input name="name" autocomplete="name" maxlength="120" required></label>
        <label>Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>
        <label>Message<textarea name="message" rows="6" maxlength="3000" required></textarea></label>
        <button class="button button-primary">Send message</button>
      </form>
    </div>`);
}

export function information(c, page) {
  const { currency, rates } = c.get('shop');
  const legalName = c.env.LEGAL_NAME;
  const legalAddress = c.env.LEGAL_ADDRESS;
  const about = html`<div class="prose"><h2>Underground music on physical formats</h2>
    <p>Ancient King Records is an independent label from Nouvelle-Aquitaine, France. It releases dungeon synth and music with medieval and fantasy influences. The distro carries work from other underground artists and labels.</p>
    <p>We focus on physical editions, from records and tapes to printed matter, and on the independent artists who make them.</p>
    <a class="button button-outline" href="/discography">Browse the discography</a></div>`;
  const news = html`<div class="prose"><article><h2>The catalogue preview</h2><p>Browse the label’s Bandcamp catalogue here, including physical editions and digital releases.</p><a class="text-link" href="#newsletter">Release notices</a></article></div>`;
  const shipping = html`<div class="prose"><h2>Shipping</h2>
    <p>Bandcamp calculates shipping for listings in the label’s Bandcamp catalogue. For items ordered here, choose a destination in the cart to see the shipping cost.</p>
    ${Object.keys(rates).length ? html`<dl class="release-facts">${Object.entries(rates).map(([country, cents]) => html`<div><dt>${countryLabel(country)}</dt><dd>${money(cents, currency)}</dd></div>`)}</dl>` : html`<p>Shipping destinations and rates are being prepared.</p>`}
    <p><a href="${BANDCAMP}/merch/tracked-shipping">Tracked shipping add-on on Bandcamp</a></p>
    <h2>Returns</h2><p>For order-specific queries or a return request, contact the label and include your order reference.</p>
    <a class="text-link" href="/contact">Contact the label</a></div>`;
  const privacy = html`<div class="prose"><h2>Information this store uses</h2><p>Cart and sign-in cookies keep your items and account session available in the browser. Account registration stores your email address and a password hash. Your email is saved when you subscribe to release notices.</p>
    <p>Contact messages are stored for label staff to review. If you place an order, Stripe collects payment and delivery details. This store receives the email, delivery details and payment status needed to record and fulfill the order.</p>
    <p>Use the contact form for questions about your information or to request removal from the release notice list.</p><a class="text-link" href="/contact">Contact the label</a></div>`;
  const terms = html`<div class="prose">
    ${legalName && legalAddress ? html`<h2>Store operator</h2><p class="preserve-lines">${legalName}<br>${legalAddress}</p>` : html`<p>Merchant details and final store terms will be added before public sales.</p>`}
    <h2>Orders</h2><p>Checkout shows the order total and shipping charge before payment. A payment is confirmed after Stripe reports it as complete.</p>
    <h2>Catalogue preview</h2><p>Bandcamp listings open the original shop for current availability, shipping, and payment.</p><a class="text-link" href="/shipping">Shipping & returns</a></div>`;
  const pages = {
    about: ['About the Label', '', about],
    news: ['News & Announcements', 'Updates from the label and store.', news],
    shipping: ['Shipping & Returns', '', shipping],
    privacy: ['Privacy Policy', '', privacy],
    terms: ['Terms & Conditions', '', terms],
  };
  return editorial(c, ...pages[page]);
}
