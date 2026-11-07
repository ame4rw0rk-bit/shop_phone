/* favorites.js — قائمة المفضلة مع الإزالة السريعة والطلب عبر تليجرام */
(() => {
  'use strict';
  const { el, $, api, toast, store } = window.App;

  let items = [];

  async function init() {
    await window.App.boot({ active: 'favorites' });
    window.App.onFavorite = (button, productId) => remove(productId, button);
    load();
  }

  async function load() {
    const grid = $('#favoritesGrid');
    window.App.renderSkeletons(grid, 3);

    try {
      const data = await api.favorites();
      items = data.items || [];
      store.favorites = new Set(items.map((item) => item.id));
      window.App.updateFavBadge();
      render();
    } catch (error) {
      if (error.status === 401) return renderLoginGate();
      window.App.renderState(grid, {
        icon: '⚠️',
        title: 'تعذّر تحميل المفضلة',
        note: 'أعد تحميل الصفحة أو جرّب لاحقاً.',
        action: { href: 'index.html', label: 'تصفح الأجهزة' }
      });
    }
  }

  function renderLoginGate() {
    const grid = $('#favoritesGrid');
    grid.textContent = '';
    grid.classList.add('is-empty');
    grid.append(window.App.el('div', { class: 'state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'state__icon', text: '🔐', 'aria-hidden': 'true' }),
      el('h3', { text: 'سجّل الدخول لمشاهدة مفضلتك' }),
      el('p', { text: 'قائمة المفضلة مرتبطة بحسابك، لذا تحتاج تسجيل الدخول أولاً.' }),
      el('a', { class: 'btn btn--primary', href: 'login.html?next=favorites.html', text: 'تسجيل الدخول' }),
      el('a', { class: 'btn btn--ghost btn--sm', href: 'login.html?mode=register', text: 'إنشاء حساب جديد' })
    ]));
    const actions = $('#favoritesActions');
    if (actions) actions.classList.add('hidden');
  }

  function render() {
    const grid = $('#favoritesGrid');
    if (!grid) return;

    if (!store.token) return renderLoginGate();

    grid.textContent = '';
    grid.classList.remove('is-empty');

    const count = $('#favoritesCount');
    if (count) count.textContent = String(items.length);

    if (!items.length) {
      window.App.renderState(grid, {
        icon: '🤍',
        title: 'قائمة المفضلة فارغة',
        note: 'اضغط على القلب ♥ في أي جهاز لإضافته هنا.',
        action: { href: 'index.html', label: 'تصفح الأجهزة' }
      });
      const actions = $('#favoritesActions');
      if (actions) actions.classList.add('hidden');
      return;
    }

    const actions = $('#favoritesActions');
    if (actions) {
      actions.classList.remove('hidden');
      actions.textContent = '';
      actions.append(
        el('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', id: 'clearAll',
          text: 'إفراغ القائمة'
        }),
        el('button', {
          type: 'button', class: 'btn btn--telegram btn--sm', id: 'orderAll',
          text: 'اطلب كل الأجهزة'
        })
      );
      $('#clearAll').addEventListener('click', clearAll);
      $('#orderAll').addEventListener('click', orderAll);
    }

    items.forEach((product) => {
      grid.append(window.App.productCard(product, new Set([product.id])));
    });
  }

  async function remove(productId, button) {
    button.classList.add('is-busy');
    try {
      const result = await api.toggleFavorite(productId);
      items = items.filter((item) => item.id !== productId);
      store.favorites = new Set(items.map((item) => item.id));
      window.App.updateFavBadge();
      toast(result.message, 'success', 2400);

      const card = document.querySelector(`.pcard[data-id="${productId}"]`);
      if (card) {
        card.style.transition = 'opacity .25s, transform .25s';
        card.style.opacity = '0';
        card.style.transform = 'scale(.96)';
        setTimeout(() => { card.remove(); if (!items.length) render(); }, 240);
      }
    } catch {
      button.classList.remove('is-busy');
    }
  }

  async function clearAll() {
    if (!items.length) return;
    if (!window.confirm('سيتم إزالة جميع الأجهزة من المفضلة. متابعة؟')) return;
    const snapshot = [...items];
    for (const product of snapshot) {
      try { await api.toggleFavorite(product.id); } catch { break; }
    }
    items = [];
    store.favorites = new Set();
    window.App.updateFavBadge();
    render();
    toast('تم إفراغ قائمة المفضلة.', 'success');
  }

  async function orderAll() {
    if (!items.length) return;
    const handle = (store.config.telegramUsername || '').replace(/^@/, '');
    const lines = [
      'مرحباً، أرغب بشراء الأجهزة التالية:',
      ...items.map((item) => `• ${item.title} — ${item.price} (${item.condition === 'used' ? 'مستعمل' : 'جديد'})`)
    ].join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      toast('تم نسخ طلبك الكامل — الصقه في محادثة تليجرام.', 'success', 6000);
    } catch {
      window.prompt('تفاصيل الطلب:', lines);
    }
    if (handle) window.open(`https://t.me/${handle}`, '_blank', 'noopener,noreferrer');
  }

  window.App.wireGlobalActions((action, target) => {
    if (action !== 'order') return;
    const product = items.find((item) => item.id === Number(target.dataset.id));
    if (product) window.App.orderOnTelegram(product);
  });

  document.addEventListener('DOMContentLoaded', init);
})();
