/* admin.js — لوحة التحكم: إحصاءات، جدول، إضافة/تعديل/حذف الأجهزة */
(() => {
  'use strict';
  const { el, $, $$, api, toast, store } = window.App;

  const state = { items: [], editingId: null, search: '', filter: 'all' };

  const FIELDS = {
    title: '#fTitle',
    price: '#fPrice',
    condition: '#fCondition',
    inStock: '#fInStock',
    imageUrl: '#fImageUrl',
    description: '#fDescription'
  };

  /* ------------------------------ الحارس ------------------------------- */
  async function guard() {
    if (!store.token) { redirect('login.html?next=admin.html'); return false; }
    try {
      const { user } = await api.me();
      if (user.role !== 'ameer_OxAmeer_admin') {
        toast('هذه اللوحة للإدارة فقط.', 'error');
        redirect('index.html');
        return false;
      }
      const who = $('#adminWho');
      if (who) who.textContent = user.username;
      return true;
    } catch {
      redirect('login.html?next=admin.html');
      return false;
    }
  }

  const redirect = (href) => setTimeout(() => { window.location.href = href; }, 1100);

  /* ------------------------------ الجدول ------------------------------- */
  async function load() {
    const body = $('#productsBody');
    body.textContent = '';
    body.append(el('tr', {}, el('td', { colspan: '6', text: 'جاري التحميل…', style: 'text-align:center;color:var(--muted)' })));

    try {
      const data = await api.products('?limit=60&sort=newest');
      state.items = data.items || [];
      renderTable();
      loadStats();
    } catch (error) {
      if (error.status === 401) return redirect('login.html?next=admin.html');
      body.textContent = '';
      body.append(el('tr', {}, el('td', { colspan: '6', text: 'تعذّر جلب الأجهزة.', style: 'text-align:center;color:var(--danger)' })));
    }
  }

  async function loadStats() {
    try {
      const stats = await api.productStats();
      setText('[data-stat="total"]', stats.total);
      setText('[data-stat="new"]', stats.newCount);
      setText('[data-stat="used"]', stats.usedCount);
      setText('[data-stat="out"]', stats.outOfStock);
    } catch { /* أرقام اختيارية */ }
  }

  const setText = (selector, value) => {
    const node = $(selector);
    if (node) node.textContent = String(value ?? '—');
  };

  function visibleItems() {
    const term = state.search.toLowerCase();
    return state.items
      .filter((item) => state.filter === 'all' || item.condition === state.filter)
      .filter((item) => !term
        || String(item.title).toLowerCase().includes(term)
        || String(item.description || '').toLowerCase().includes(term));
  }

  function renderTable() {
    const body = $('#productsBody');
    body.textContent = '';
    const rows = visibleItems();
    setText('#adminCount', rows.length);

    if (!rows.length) {
      body.append(el('tr', {}, el('td', {
        colspan: '6',
        text: state.search ? 'لا توجد نتيجة لهذا البحث.' : 'لا توجد أجهزة بعد — أضف أول جهاز من النموذج.',
        style: 'text-align:center;color:var(--muted);padding:26px 0'
      })));
      return;
    }

    for (const product of rows) {
      body.append(el('tr', { dataset: { id: product.id } }, [
        el('td', { 'data-label': 'الصورة' }, el('img', {
          class: 'table__thumb',
          src: window.App.safeImage(product.imageUrl),
          alt: '',
          loading: 'lazy',
          onerror: (event) => { event.currentTarget.src = window.App.PLACEHOLDER_IMAGE; }
        })),
        el('td', { 'data-label': 'الجهاز' }, el('span', { class: 'table__title', text: product.title })),
        el('td', { 'data-label': 'السعر' }, el('strong', { text: `$${window.App.money(product.price)}` })),
        el('td', { 'data-label': 'الحالة' }, el('span', {
          class: `badge ${product.condition === 'used' ? 'badge--used' : 'badge--new'}`,
          text: product.condition === 'used' ? 'مستعمل' : 'جديد'
        })),
        el('td', { 'data-label': 'التوفر' }, el('span', {
          class: `badge ${product.inStock ? '' : 'badge--out'}`,
          text: product.inStock ? 'متوفر' : 'نفد'
        })),
        el('td', { 'data-label': 'إجراءات' }, el('div', { class: 'table__actions' }, [
          el('button', {
            type: 'button', class: 'row-btn', dataset: { edit: String(product.id) }, text: 'تعديل'
          }),
          el('a', {
            class: 'row-btn', href: `index.html?p=${product.id}`, target: '_blank',
            rel: 'noopener', text: 'معاينة'
          }),
          el('button', {
            type: 'button', class: 'row-btn row-btn--danger', dataset: { del: String(product.id) }, text: 'حذف'
          })
        ]))
      ]));
    }
  }

  /* ---------------------------- نموذج الجهاز ---------------------------- */
  function readForm() {
    return {
      title: $(FIELDS.title).value.trim(),
      price: $(FIELDS.price).value,
      condition: $(FIELDS.condition).value,
      inStock: $(FIELDS.inStock).value === 'true',
      imageUrl: $(FIELDS.imageUrl).value.trim(),
      description: $(FIELDS.description).value.trim()
    };
  }

  function fillForm(product) {
    $(FIELDS.title).value = product?.title || '';
    $(FIELDS.price).value = product?.price ?? '';
    $(FIELDS.condition).value = product?.condition || 'new';
    $(FIELDS.inStock).value = String(product ? product.inStock : true);
    $(FIELDS.imageUrl).value = product?.imageUrl || '';
    $(FIELDS.description).value = product?.description || '';
    updatePreview();
  }

  function updatePreview() {
    const host = $('#imagePreview');
    if (!host) return;
    const url = $(FIELDS.imageUrl).value.trim();
    host.textContent = '';
    if (/^https?:\/\/\S+$/i.test(url)) {
      host.append(el('img', {
        src: url, alt: 'معاينة الصورة',
        onerror: () => {
          host.textContent = '';
          host.append(el('span', { class: 'text-muted', text: 'تعذّر تحميل هذه الصورة.' }));
        }
      }));
    } else {
      host.append(el('span', { class: 'text-muted', text: url ? 'رابط غير صالح' : 'الصورة الافتراضية ستُستخدم.' }));
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    const payload = readForm();
    const button = event.submitter || $('#saveProductBtn');

    if (payload.title.length < 2) { toast('اسم الجهاز قصير جداً.', 'error'); return; }
    if (payload.price === '' || Number(payload.price) < 0) { toast('حدّد سعراً صحيحاً.', 'error'); return; }

    button.disabled = true;
    try {
      const result = state.editingId
        ? await api.updateProduct(state.editingId, payload)
        : await api.createProduct(payload);

      toast(result.message, 'success');
      resetForm();
      await load();
    } catch { /* الرسالة في التبليغ */ }
    finally { button.disabled = false; }
  }

  function resetForm() {
    state.editingId = null;
    $('#productForm').reset();
    fillForm(null);
    $('#formModeLabel').textContent = 'إضافة جهاز جديد';
    $('#saveProductBtn').textContent = 'حفظ الجهاز';
    $('#cancelEditBtn').classList.add('hidden');
  }

  function startEdit(id) {
    const product = state.items.find((item) => item.id === Number(id));
    if (!product) return;
    state.editingId = product.id;
    fillForm(product);
    $('#formModeLabel').textContent = `تعديل: ${product.title}`;
    $('#saveProductBtn').textContent = 'حفظ التعديلات';
    $('#cancelEditBtn').classList.remove('hidden');
    $('#productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function removeProduct(id) {
    const product = state.items.find((item) => item.id === Number(id));
    if (!product) return;
    if (!window.confirm(`سيتم حذف «${product.title}» نهائياً مع كل المفضلات المرتبطة به. متابعة؟`)) return;

    try {
      const result = await api.deleteProduct(id);
      toast(result.message, 'success');
      if (state.editingId === product.id) resetForm();
      await load();
    } catch { /* تم التبليغ */ }
  }

  /* ------------------------------ الأحداث ------------------------------ */
  function bindEvents() {
    $('#productForm').addEventListener('submit', submitForm);
    $('#cancelEditBtn').addEventListener('click', resetForm);
    $('#reloadBtn').addEventListener('click', () => { load(); toast('تم تحديث القائمة.', 'info', 2000); });

    $(FIELDS.imageUrl).addEventListener('input', () => updatePreview());

    $('#adminSearch').addEventListener('input', (event) => {
      state.search = event.target.value.trim();
      renderTable();
    });

    $$('.tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.filter = tab.dataset.filter;
        $$('.tabs .tab').forEach((other) => other.classList.toggle('is-active', other === tab));
        renderTable();
      });
    });

    $('#productsBody').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit]');
      if (edit) return startEdit(edit.dataset.edit);
      const del = event.target.closest('[data-del]');
      if (del) return removeProduct(del.dataset.del);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await window.App.boot({ active: 'admin' });
    if (!await guard()) return;

    bindEvents();
    fillForm(null);
    await load();
  });
})();
