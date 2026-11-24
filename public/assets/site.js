const notice = document.querySelector('[data-notice]');
let hideNotice;

function announce(text) {
  notice.textContent = text;
  clearTimeout(hideNotice);
  hideNotice = setTimeout(() => { notice.textContent = ''; }, 4500);
}

function updateCart(count) {
  document.querySelector('[data-cart-count]').textContent = count;
  document.querySelector('[data-cart-link]').setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`);
}

document.querySelector('[data-open-search]').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const dialog = document.querySelector('#search-dialog');
  if (!dialog.showModal) return;
  event.preventDefault();
  dialog.showModal();
});

let quickRequest;
document.addEventListener('click', async event => {
  const link = event.target.closest('[data-quick-view]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const dialog = document.querySelector('#quick-dialog');
  if (!dialog.showModal) return;
  event.preventDefault();
  quickRequest?.abort();
  const request = new AbortController();
  quickRequest = request;
  const content = dialog.querySelector('[data-quick-content]');
  content.textContent = 'Loading release…';
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch(link.dataset.quickView, { signal: request.signal });
    if (!response.ok) throw new Error('Release unavailable');
    content.innerHTML = await response.text();
  } catch (error) {
    if (error.name !== 'AbortError') content.textContent = 'Quick view is unavailable. Open the release page for details.';
  }
});

let cartRequest = false;
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-add-form]')) return;
  event.preventDefault();
  if (cartRequest) return;
  const button = form.querySelector('button');
  button.disabled = true;
  cartRequest = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new URLSearchParams(new FormData(form)),
      headers: { Accept: 'application/json' },
    });
    const result = await response.json();
    if (!response.ok) {
      announce(result.error || 'This item could not be added.');
      return;
    }
    updateCart(result.count);
    announce(result.message);
    if (form.closest('dialog')?.open) form.closest('dialog').close();
  } catch {
    announce('The cart could not be updated. Try again.');
  } finally {
    button.disabled = false;
    cartRequest = false;
  }
});

document.querySelector('.thumbnails')?.addEventListener('click', event => {
  const link = event.target.closest('[data-gallery-image]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  document.querySelector('[data-main-art]').src = link.href;
  document.querySelector('[data-main-art-link]').href = link.href;
  document.querySelector('[data-gallery-image][aria-current="true"]').setAttribute('aria-current', 'false');
  link.setAttribute('aria-current', 'true');
});
