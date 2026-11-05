/* ==========================================================================
   core.js — طبقة مشتركة: الإعدادات، الاتصال بالـ API، الحالة، التبليغات، الهيدر
   كل الدوال عامة على window حتى تستخدمها سكربتات الصفحات (بدون سكربت مضمّن).
   ========================================================================== */
(() => {
  'use strict';

  const API = {
    base: '/api',
    tokenKey: 'tg_token',
    userKey: 'tg_user'
  };

  /* ------------------------------ أدوات DOM ----------------------------- */
  const el = (tag, options = {}, children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(options)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'html') throw new Error('html option is disabled to keep rendering XSS-safe');
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children ?? [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const money = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const PLACEHOLDER_IMAGE = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#F1F5F9"/>
      <g fill="#CBD5E1">
        <rect x="182" y="96" width="116" height="168" rx="18"/>
        <rect x="196" y="112" width="88" height="120" rx="6" fill="#E2E8F0"/>
        <circle cx="240" cy="248" r="8" fill="#E2E8F0"/>
      </g>
      <text x="240" y="300" font-family="Tajawal, sans-serif" font-size="20" fill="#94A3B8" text-anchor="middle">لا توجد صورة</text>
    </svg>`);

  const safeImage = (url) => {
    if (typeof url === 'string' && /^https?:\/\/\S+$/i.test(url)) return url;
    return PLACEHOLDER_IMAGE;
  };

  /* ------------------------------ التبليغات ----------------------------- */
  const toast = (message, type = 'info', timeout = 4200) => {
    let host = $('.toasts');
    if (!host) {
      host = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.append(host);
    }
    const icons = { success: '✅', error: '⛔', info: 'ℹ️' };
    const box = el('div', { class: `toast is-${type}` }, [
      el('span', { text: icons[type] || icons.info, 'aria-hidden': 'true' }),
      el('span', { text: message }),
      el('button', {
        class: 'toast__close',
        type: 'button',
        'aria-label': 'إغلاق التنبيه',
        text: '×',
        onclick: () => dismiss()
      })
    ]);

    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      box.classList.add('is-leaving');
      box.addEventListener('animationend', () => box.remove(), { once: true });
      setTimeout(() => box.remove(), 400);
    };

    host.append(box);
    timer = setTimeout(dismiss, timeout);
    while (host.children.length > 4) host.firstElementChild.remove();
  };

  /* ------------------------------- الحالة ------------------------------- */
  const store = {
    get token() { return localStorage.getItem(API.tokenKey) || ''; },
    set token(value) {
      if (value) localStorage.setItem(API.tokenKey, value);
      else localStorage.removeItem(API.tokenKey);
      App.user = null;
    },
    get config() { return App._config || { storeName: 'Phone Store', telegramUsername: '' }; },
    set config(value) { App._config = value; },
    get favorites() {
      try { return new Set(JSON.parse(localStorage.getItem('tg_favs') || '[]')); }
      catch { return new Set(); }
    },
    set favorites(ids) { localStorage.setItem('tg_favs', JSON.stringify([...ids])); }
  };

  const isAdmin = () => decodeToken(store.token)?.role === 'ameer_OxAmeer_admin';

  function decodeToken(token) {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch {
      return null;
    }
  }

  const currentUser = () => {
    const decoded = decodeToken(store.token);
    if (!decoded) return null;
    return { id: decoded.sub, username: decoded.username, role: decoded.role };
  };

  const logout = (message = 'تم تسجيل الخروج') => {
    store.token = '';
    localStorage.removeItem('tg_favs');
    localStorage.removeItem(API.userKey);
    toast(message, 'info');
    setTimeout(() => window.location.reload(), 450);
  };

  /* ---------------------------- الاتصال بالـ API ------------------------ */
  async function request(path, { method = 'GET', body, auth = false, quiet = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && store.token) headers.Authorization = `Bearer ${store.token}`;

    let res;
    try {
      res = await fetch(`${API.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      if (!quiet) toast('تعذّر الاتصال بالسيرفر، تحقق من تشغيل الخادم.', 'error');
      throw new ApiError(0, 'تعذّر الاتصال بالسيرفر');
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (res.status === 401 && auth) {
      store.token = '';
      localStorage.removeItem('tg_favs');
      if (!quiet) {
        toast('انتهت الجلسة، سجّل الدخول من جديد.', 'error');
        const here = window.location.pathname.split('/').pop() || 'index.html';
        if (here !== 'login.html') {
          setTimeout(() => window.location.href = `login.html?next=${encodeURIComponent(here)}`, 900);
        }
      }
      throw new ApiError(401, data?.message || 'انتهت الجلسة');
    }

    if (!res.ok) {
      const message = data?.message || data?.error || `خطأ في الخادم (${res.status})`;
      if (!quiet) toast(message, 'error');
      throw new ApiError(res.status, message, data?.details);
    }

    return data;
  }

  class ApiError extends Error {
    constructor(status, message, details) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }

  const api = {
    config: () => request('/config'),
    health: () => request('/health', { quiet: true }),
    products: (query = '') => request(`/products${query}`),
    productStats: () => request('/products/stats', { quiet: true }),
    createProduct: (body) => request('/products', { method: 'POST', body, auth: true }),
    updateProduct: (id, body) => request(`/products/${id}`, { method: 'PUT', body, auth: true }),
    deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE', auth: true }),
    favorites: () => request('/favorites', { auth: true, quiet: true }),
    favoriteIds: () => request('/favorites/ids', { auth: true, quiet: true }),
    toggleFavorite: (productId) => request('/favorites/toggle', { method: 'POST', body: { productId }, auth: true }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    register: (body) => request('/auth/register', { method: 'POST', body }),
    me: () => request('/auth/me', { auth: true, quiet: true }),
    recoveryVerify: (body) => request('/auth/recovery/verify', { method: 'POST', body }),
    recoveryReset: (body) => request('/auth/recovery/reset', { method: 'POST', body })
  };

  /* ------------------------------- المفضلة ------------------------------ */
  async function syncFavoriteIds() {
    if (!store.token) { store.favorites = new Set(); updateFavBadge(); return new Set(); }
    try {
      const { ids } = await api.favoriteIds();
      store.favorites = new Set(ids);
    } catch {
      store.favorites = new Set();
    }
    updateFavBadge();
    return store.favorites;
  }

  async function toggleFavorite(button, productId) {
    if (!store.token) {
      toast('سجّل الدخول أولاً لإضافة جهاز إلى المفضلة.', 'info');
      setTimeout(() => { window.location.href = 'login.html'; }, 1100);
      return;
    }

    button.classList.add('is-busy');
    try {
      const result = await api.toggleFavorite(productId);
      const ids = store.favorites;
      if (result.isFavorite) ids.add(productId); else ids.delete(productId);
      store.favorites = ids;

      button.classList.toggle('is-fav', result.isFavorite);
      button.setAttribute('aria-pressed', String(result.isFavorite));
      button.setAttribute('aria-label', result.isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة');
      button.classList.add('is-pop');
      setTimeout(() => button.classList.remove('is-pop'), 400);
      updateFavBadge();
      toast(result.message, 'success', 2600);
      return result;
    } catch {
      /* الرسالة ظهرت في التبليغات */
    } finally {
      button.classList.remove('is-busy');
    }
  }

  function updateFavBadge() {
    const count = store.token ? store.favorites.size : 0;
    $$('[data-fav-count]').forEach((node) => {
      node.textContent = String(count);
      node.classList.toggle('is-empty', count === 0);
    });
  }

  /* ---------------------------- طلب عبر تليجرام ------------------------- */
  function orderOnTelegram(product) {
    const handle = (store.config.telegramUsername || '').replace(/^@/, '').trim();
    const message = [
      'مرحباً، أرغب بشراء الجهاز التالي:',
      `• الاسم: ${product.title}`,
      `• السعر: $${money(product.price)}`,
      `• الحالة: ${product.condition === 'used' ? 'مستعمل' : 'جديد'}`,
      `• الرابط: ${window.location.origin}/?p=${product.id}`
    ].join('\n');

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(message);
        toast('تم نسخ تفاصيل الطلب — الصقها في محادثة تليجرام.', 'success');
      } catch {
        toast('تعذّر النسخ التلقائي، انسخ التفاصيل من نافذة الطلب.', 'info');
        window.prompt('تفاصيل الطلب:', message);
      }
    };

    if (!handle) {
      toast('المتجر لم يحدد حساب تليجرام بعد.', 'error');
      copy();
      return;
    }

    copy();
    window.open(`https://t.me/${handle}`, '_blank', 'noopener,noreferrer');
  }

  /* ------------------------------- كرت المنتج -------------------------- */
  function productCard(product, favorites) {
    const isFav = favorites.has(product.id);

    const image = el('img', {
      src: safeImage(product.imageUrl),
      alt: product.title,
      loading: 'lazy',
      decoding: 'async',
      width: '480',
      height: '360',
      onerror: (event) => { event.currentTarget.src = PLACEHOLDER_IMAGE; }
    });

    const media = el('div', { class: 'pcard__media' }, [
      el('span', {
        class: `badge ${product.condition === 'used' ? 'badge--used' : 'badge--new'}`,
        text: product.condition === 'used' ? 'مستعمل' : 'جديد'
      }),
      image,
      el('button', {
        type: 'button',
        class: `fav-btn${isFav ? ' is-fav' : ''}`,
        'aria-pressed': String(isFav),
        'aria-label': isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة',
        title: isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة',
        dataset: { id: String(product.id), action: 'favorite' },
        text: '♥'
      }),
      product.inStock ? null : el('span', { class: 'pcard__soldout', text: 'غير متوفر' })
    ]);

    const body = el('div', { class: 'pcard__body' }, [
      el('h3', { class: 'pcard__title', title: product.title, text: product.title }),
      product.description ? el('p', { class: 'pcard__desc', text: product.description }) : null,
      el('div', { class: 'pcard__foot' }, [
        el('div', { class: 'price' }, [
          el('span', { class: 'price__value', text: `$${money(product.price)}` }),
          el('span', { class: 'price__currency', text: 'دولار أمريكي' })
        ]),
        el('span', { class: 'badge', text: product.inStock ? 'متوفر' : 'نفد' })
      ])
    ]);

    const cta = el('div', { class: 'pcard__cta' }, el('button', {
      type: 'button',
      class: 'btn btn--telegram btn--block',
      disabled: !product.inStock,
      dataset: { id: String(product.id), action: 'order' },
      text: product.inStock ? 'اطلب عبر تليجرام' : 'غير متوفر حالياً'
    }));

    return el('article', { class: 'pcard', dataset: { id: String(product.id) } }, [media, body, cta]);
  }

  function renderSkeletons(container, count = 6) {
    container.textContent = '';
    for (let i = 0; i < count; i++) {
      container.append(el('div', { class: 'skeleton', 'aria-hidden': 'true' }, [
        el('div', { class: 'skeleton__media' }),
        el('div', { class: 'skeleton__line' }),
        el('div', { class: 'skeleton__line' })
      ]));
    }
  }

  function renderState(container, { icon = '📦', title, note = '', action }) {
    container.textContent = '';
    container.classList.add('is-empty');
    container.append(el('div', { class: 'state', style: 'grid-column: 1 / -1;' }, [
      el('div', { class: 'state__icon', text: icon, 'aria-hidden': 'true' }),
      el('h3', { text: title }),
      note ? el('p', { text: note }) : null,
      action ? el('a', { class: 'btn btn--ghost btn--sm', href: action.href, text: action.label }) : null
    ]));
  }

  /* ----------------------------- الهيدر والدرج -------------------------- */
  function mountChrome(options = {}) {
    const active = options.active || '';
    const user = currentUser();
    const name = store.config.storeName || 'Phone Store';

    const nav = document.querySelector('header.navbar');
    if (!nav) return;

    const links = [
      { href: 'index.html', label: 'الرئيسية', key: 'home' },
      { href: 'index.html#new-devices', label: 'أجهزة جديدة', key: 'new' },
      { href: 'index.html#used-devices', label: 'أجهزة مستعملة', key: 'used' },
      { href: 'favorites.html', label: 'المفضلة', key: 'favorites' }
    ];
    if (user?.role === 'ameer_OxAmeer_admin') {
      links.push({ href: 'admin.html', label: 'لوحة التحكم', key: 'admin' });
    }

    const desktopLinks = el('nav', { class: 'nav-links', 'aria-label': 'التنقل الرئيسي' },
      links.map((link) => el('a', {
        href: link.href,
        class: link.key === active ? 'is-active' : '',
        'aria-current': link.key === active ? 'page' : null,
        text: link.label
      })));

    const authArea = el('div', { id: 'authArea', class: 'nav-actions' });
    renderAuthArea(authArea, user);

    const favLink = el('a', {
      class: 'icon-btn',
      href: 'favorites.html',
      title: 'المفضلة',
      'aria-label': 'فتح قائمة المفضلة'
    }, [
      el('span', { 'aria-hidden': 'true', text: '♥' }),
      el('span', { class: 'icon-btn__count is-empty', 'data-fav-count': '', text: '0' })
    ]);

    const burger = el('button', {
      type: 'button',
      class: 'icon-btn burger',
      'aria-expanded': 'false',
      'aria-controls': 'mobileDrawer',
      'aria-label': 'فتح القائمة'
    }, [
      el('span', {}), el('span', {}), el('span', {})
    ]);

    nav.textContent = '';
    nav.append(el('div', { class: 'container navbar__inner' }, [
      el('a', { class: 'logo', href: 'index.html', 'aria-label': `${name} — الصفحة الرئيسية` }, [
        el('span', { class: 'logo__mark', 'aria-hidden': 'true', text: '📱' }),
        el('span', { class: 'logo__text', text: name })
      ]),
      desktopLinks,
      el('div', { class: 'nav-actions' }, [favLink, authArea, burger])
    ]));

    mountDrawer(links, active, user);
    burger.addEventListener('click', () => toggleDrawer());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });
  }

  function renderAuthArea(host, user) {
    host.textContent = '';
    if (!user) {
      host.append(el('a', { class: 'btn btn--primary btn--sm', href: 'login.html', text: 'تسجيل الدخول' }));
      return;
    }
    host.append(
      el('span', { class: 'badge badge--admin', text: user.username, title: 'الحساب الحالي' }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        style: 'color:#fff;border-color:rgba(148,163,184,.4)',
        dataset: { action: 'logout' },
        text: 'خروج'
      })
    );
  }

  function mountDrawer(links, active, user) {
    let drawer = $('#mobileDrawer');
    if (drawer) drawer.remove();

    const panel = el('div', { class: 'drawer__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'قائمة التنقل', id: 'mobileDrawerPanel' }, [
      el('div', { class: 'drawer__head' }, [
        el('strong', { text: 'القائمة' }),
        el('button', {
          type: 'button', class: 'icon-btn drawer__close', 'aria-label': 'إغلاق القائمة', text: '×',
          onclick: () => toggleDrawer(false)
        })
      ]),
      ...links.map((link) => el('a', {
        href: link.href,
        class: link.key === active ? 'is-active' : '',
        text: link.label
      })),
      el('div', { class: 'drawer__section', text: user ? `مرحباً ${user.username}` : 'حسابي' }),
      user
        ? el('button', { type: 'button', class: 'linklike', dataset: { action: 'logout' }, text: 'تسجيل الخروج' })
        : el('a', { href: 'login.html', text: 'تسجيل الدخول / حساب جديد' })
    ]);

    drawer = el('div', { class: 'drawer', id: 'mobileDrawer' }, [
      el('div', { class: 'drawer__scrim', onclick: () => toggleDrawer(false) }),
      panel
    ]);
    document.body.append(drawer);
  }

  function toggleDrawer(force) {
    const drawer = $('#mobileDrawer');
    const burger = $('.burger');
    if (!drawer) return;
    const willOpen = force === undefined ? !drawer.classList.contains('is-open') : force;
    drawer.classList.toggle('is-open', willOpen);
    if (burger) {
      burger.setAttribute('aria-expanded', String(willOpen));
      burger.setAttribute('aria-label', willOpen ? 'إغلاق القائمة' : 'فتح القائمة');
    }
    document.body.style.overflow = willOpen ? 'hidden' : '';
    if (willOpen) $('.drawer__close', drawer)?.focus();
  }

  const closeDrawer = () => toggleDrawer(false);

  /* ------------------------- أحداث عامة بالتفويض ------------------------ */
  function wireGlobalActions(handler) {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'favorite') {
        event.preventDefault();
        const handler = App.onFavorite || ((btn, id) => toggleFavorite(btn, id));
        handler(target, Number(target.dataset.id));
        return;
      }
      if (action === 'order') {
        event.preventDefault();
        handler?.('order', target);
        return;
      }
      if (action === 'logout') {
        event.preventDefault();
        logout();
      }
    });
  }

  /* -------------------------------- الإقلاع ----------------------------- */
  const App = {
    el, $, $$, api, request, ApiError,
    toast, money, store, decodeToken, currentUser, isAdmin, logout,
    safeImage, PLACEHOLDER_IMAGE,
    productCard, renderSkeletons, renderState,
    syncFavoriteIds, toggleFavorite, updateFavBadge,
    mountChrome, renderAuthArea, toggleDrawer, wireGlobalActions,
    orderOnTelegram,
    onFavorite: null,
    _config: null
  };

  async function boot(options = {}) {
    try {
      App.store.config = await api.config();
    } catch {
      App.store.config = { storeName: 'Phone Store', telegramUsername: '' };
    }
    const name = App.store.config.storeName || 'Phone Store';
    const pageTitle = (document.body.dataset.pageTitle || '').trim();
    document.title = pageTitle ? `${pageTitle} | ${name}` : `${name}`;

    const year = $('.footer #year');
    if (year) year.textContent = String(new Date().getFullYear());
    const telegramLink = $('#footerTelegram');
    if (telegramLink && App.store.config.telegramUsername) {
      telegramLink.href = `https://t.me/${App.store.config.telegramUsername.replace(/^@/, '')}`;
    }
    if (telegramLink && !App.store.config.telegramUsername) telegramLink.classList.add('hidden');

    mountChrome(options);
    await syncFavoriteIds();
  }

  App.boot = boot;
  window.App = App;
})();