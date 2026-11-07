/* home.js — الواجهة الرئيسية: بحث، فلترة، وقسمان للأجهزة الجديدة والمستعملة */
(() => {
  'use strict';
  const { el, $, $$, api, toast, money, store } = window.App;

  const state = {
    all: [],
    search: '',
    sort: 'newest',
    onlyAvailable: false,
    shown: { new: 0, used: 0 }
  };

  const PAGE_STEP = 12;

  const SORTS = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    title: (a, b) => String(a.title).localeCompare(String(b.title), 'ar')
  };

  async function init() {
    buildToolbar();
    await window.App.boot({ active: 'home' });
    load();
  }

  /* ------------------------------ شريط الأدوات --------------------------- */
  function buildToolbar() {
    const host = $('#catalogToolbar');
    if (!host) return;

    const search = el('input', {
      class: 'input',
      type: 'search',
      id: 'searchInput',
      placeholder: 'ابحث باسم الجهاز أو المواصفات…',
      'aria-label': 'البحث في الأجهزة',
      autocomplete: 'off',
      maxlength: '60'
    });

    const sort = el('select', { class: 'select', id: 'sortSelect', 'aria-label': 'ترتيب النتائج' },
      Object.entries({
        newest: 'الأحدث أولاً',
        oldest: 'الأقدم أولاً',
        title: 'حسب الاسم'
      }).map(([value, label]) => el('option', { value, text: label })));

    const availability = el('label', { class: 'checkline' }, [
      el('input', { type: 'checkbox', id: 'availableOnly' }),
      el('span', { text: 'المتوفر فقط' })
    ]);

    const reset = el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm hidden', id: 'resetFilters', text: 'مسح الفلاتر ✕'
    });

    const count = el('span', { class: 'toolbar__meta', id: 'resultCount', 'aria-live': 'polite' });

    host.append(
      el('div', { class: 'toolbar__row' }, [
        el('div', { class: 'toolbar__search' }, search),
        sort,
        availability,
        reset
      ]),
      el('div', { class: 'toolbar__row' }, count)
    );

    search.addEventListener('input', debounce(() => {
      state.search = search.value.trim();
      render();
    }, 180));

    sort.addEventListener('change', () => { state.sort = sort.value; render(); });
    availability.addEventListener('change', () => { state.onlyAvailable = availability.checked; render(); });
    reset.addEventListener('click', () => {
      search.value = '';
      sort.value = 'newest';
      availability.checked = false;
      Object.assign(state, { search: '', sort: 'newest', onlyAvailable: false });
      render();
    });
  }

  /* -------------------------------- التحميل ------------------------------ */
  async function load() {
    const grids = { new: $('#new-products-grid'), used: $('#used-products-grid') };
    Object.values(grids).forEach((grid) => window.App.renderSkeletons(grid, 4));

    try {
      const data = await api.products('?limit=60');
      state.all = data.items || [];
      await decorateFavorites();
      render();
      loadStats();
      highlightDeepLink();
    } catch {
      Object.values(grids).forEach((grid) => window.App.renderState(grid, {
        icon: '⚠️',
        title: 'تعذّر تحميل الأجهزة',
        note: 'تأكد من تشغيل الخادم ثم أعد تحميل الصفحة.',
        action: { href: 'index.html', label: 'إعادة المحاولة' }
      }));
    }
  }

  async function decorateFavorites() {
    const ids = store.favorites;
    state.all.forEach((p) => { p.isFavorite = ids.has(p.id); });
  }

  async function loadStats() {
    try {
      const stats = await api.productStats();
      setText('[data-stat="new"]', stats.newCount);
      setText('[data-stat="used"]', stats.usedCount);
      setText('[data-stat="total"]', stats.total);
    } catch { /* أرقام اختيارية */ }
  }

  const setText = (selector, value) => {
    const node = $(selector);
    if (node) node.textContent = String(value ?? '—');
  };

  /* -------------------------------- العرض ------------------------------- */
  function filtered(condition) {
    const term = state.search.toLowerCase();
    return state.all
      .filter((p) => p.condition === condition)
      .filter((p) => !state.onlyAvailable || p.inStock)
      .filter((p) => !term
        || String(p.title).toLowerCase().includes(term)
        || String(p.description || '').toLowerCase().includes(term))
      .sort(SORTS[state.sort] || SORTS.newest);
  }

  function render() {
    const totals = { new: filtered('new').length, used: filtered('used').length };
    setText('#resultCount', `${totals.new + totals.used} جهاز مطابق${state.search ? ` لبحث «${state.search}»` : ''}`);
    const reset = $('#resetFilters');
    if (reset) reset.classList.toggle('hidden', !(state.search || state.onlyAvailable || state.sort !== 'newest'));

    for (const condition of ['new', 'used']) {
      const grid = $(`#${condition}-products-grid`);
      if (!grid) continue;
      const items = filtered(condition);
      const filtering = Boolean(state.search || state.onlyAvailable || state.sort !== 'newest');
      const visibleCount = filtering ? items.length : Math.min(items.length, PAGE_STEP);
      state.shown[condition] = visibleCount;

      grid.textContent = '';
      grid.classList.remove('is-empty');

      if (!items.length) {
        window.App.renderState(grid, {
          icon: state.search ? '🔍' : '📦',
          title: state.search ? 'لا توجد نتائج مطابقة' : 'لا توجد أجهزة في هذا القسم',
          note: state.search ? 'جرّب كلمة أخرى أو امسح الفلاتر.' : 'أضف أجهزة من لوحة التحكم وستظهر هنا.'
        });
        toggleMore(condition, 0);
        continue;
      }

      items.slice(0, visibleCount).forEach((product) => {
        grid.append(window.App.productCard(product, store.favorites));
      });
      toggleMore(condition, items.length - visibleCount);
    }
  }

  function toggleMore(condition, remaining) {
    const button = $(`#${condition}-more`);
    if (!button) return;
    button.classList.toggle('hidden', remaining <= 0);
    button.textContent = `عرض ${Math.min(remaining, PAGE_STEP)} جهاز إضافي ↓`;
  }

  function bindMoreButtons() {
    ['new', 'used'].forEach((condition) => {
      const button = $(`#${condition}-more`);
      if (!button) return;
      button.addEventListener('click', () => {
        state.shown[condition] += PAGE_STEP;
        const items = filtered(condition);
        const grid = $(`#${condition}-products-grid`);
        items.slice(state.shown[condition] - PAGE_STEP, state.shown[condition]).forEach((product) => {
          grid.append(window.App.productCard(product, store.favorites));
        });
        toggleMore(condition, items.length - state.shown[condition]);
      });
    });
  }

  function highlightDeepLink() {
    const id = Number(new URLSearchParams(window.location.search).get('p'));
    if (!id) return;
    const card = document.querySelector(`.pcard[data-id="${id}"]`);
    if (!card) { toast('هذا الجهاز غير متاح أو تم حذفه.', 'error'); return; }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.outline = '3px solid var(--brand)';
    setTimeout(() => { card.style.outline = ''; }, 2600);
  }

  /* ------------------------------ أحداث الصفحة -------------------------- */
  function bindActions() {
    window.App.wireGlobalActions((action, target) => {
      if (action !== 'order') return;
      const product = state.all.find((item) => item.id === Number(target.dataset.id));
      if (product) window.App.orderOnTelegram(product);
    });
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindActions();
    bindMoreButtons();
    init();

    // تحديث علامات المفضلة بعد الرجوع من صفحة أخرى
    window.addEventListener('focus', async () => {
      await window.App.syncFavoriteIds();
      await decorateFavorites();
    });
  });
})();
