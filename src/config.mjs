export const BRAND = 'Ancient King Records';
export const DESCRIPTION = 'Independent record label and underground distro for dungeon synth, black metal and dark ambient.';
export const GENRES = ['Dungeon synth', 'Black metal', 'Dark ambient', 'Medieval folk', 'Other'];
export const CATEGORIES = [
  ['all-releases', 'All releases', 'The full underground catalogue.', 'all'],
  ['vinyl-lps', 'Vinyl LPs', 'Full-length releases on vinyl.', 'manual'],
  ['double-lps', 'Double LPs', 'Full-length editions on two records.', 'manual'],
  ['eps', 'EPs', 'Short-form and extended play releases.', 'manual'],
  ['cds', 'CDs', 'Compact discs from the catalogue.', 'manual'],
  ['cassettes', 'Cassettes', 'Underground releases on tape.', 'manual'],
  ['merchandise', 'Merchandise', 'Prints, patches and other label goods.', 'manual'],
  ['shirts', 'Shirts', 'Label and artist apparel.', 'manual'],
  ['zines-and-publications', 'Zines & publications', 'Underground print and independent writing.', 'manual'],
  ['special-editions', 'Special editions', 'Limited runs and alternate editions.', 'manual'],
  ['new-arrivals', 'New arrivals', 'Releases added in the last 90 days.', 'recent'],
  ['sale', 'Sale', 'Currently discounted catalogue titles.', 'sale'],
];

export const FORMATS = [
  ['vinyl-lps', 'Vinyl LPs', 'sleeve-0.webp'],
  ['cds', 'CDs', 'sleeve-3.webp'],
  ['cassettes', 'Cassettes', 'sleeve-2.webp'],
  ['merchandise', 'Shirts & merch', 'sleeve-1.webp'],
  ['zines-and-publications', 'Zines & publications', 'sleeve-5.webp'],
];

export const SAMPLE_ART = '/assets/sleeve-0.webp';

export function shopSettings(env, requestUrl) {
  const requestedCurrency = /^[a-z]{3}$/i.test(env.SHOP_CURRENCY ?? '') ? env.SHOP_CURRENCY.toUpperCase() : 'EUR';
  const currency = new Intl.NumberFormat('en', { style: 'currency', currency: requestedCurrency })
    .resolvedOptions().maximumFractionDigits === 2 ? requestedCurrency : 'EUR';
  const rates = Object.create(null);
  try {
    for (const [country, value] of Object.entries(JSON.parse(env.SHIPPING_RATES ?? '{}'))) {
      if (/^[A-Z]{2}$/.test(country) && Number.isSafeInteger(value) && value >= 0 && value <= 100_000) {
        rates[country] = value;
      }
    }
  } catch {
    // Invalid shipping configuration keeps checkout unavailable.
  }

  let origin = '';
  try {
    const url = new URL(env.SHOP_ORIGIN);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      origin = url.origin;
    }
  } catch {
    // Preview can use relative links and needs no production origin.
  }

  const test = /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '');
  const stripeKey = /^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY ?? '');
  const checkout = env.ENABLE_CHECKOUT === 'true' && stripeKey && env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')
    && Object.keys(rates).length > 0 && origin && (test || origin.startsWith('https://'));
  return {
    currency, rates, origin, test, checkout: Boolean(checkout),
    secure: new URL(requestUrl).protocol === 'https:' || origin.startsWith('https://'),
  };
}

export function money(cents, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100);
}

export function dateLabel(value) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(typeof value === 'number' ? value * 1000 : new Date(value + 'T00:00:00Z'));
}

export function countryLabel(code) {
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
}

export function cleanUrl(input) {
  const value = String(input ?? '').trim();
  if (/^\/assets\/[a-z\d][a-z\d./_-]*$/i.test(value) && !value.includes('..')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    return '';
  }
  return '';
}
