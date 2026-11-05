/* login.js — تسجيل الدخول، إنشاء حساب، واسترجاع الحساب بكود الطوارئ */
(() => {
  'use strict';
  const { el, $, $$, api, toast, store } = window.App;

  const PANELS = ['login', 'register', 'recovery'];
  let recoveryToken = '';

  /* ------------------------------- التنقّل ------------------------------ */
  function showPanel(name) {
    PANELS.forEach((panel) => {
      const form = $(`#panel-${panel}`);
      if (form) form.classList.toggle('hidden', panel !== name);
    });
    $$('.auth-tabs button').forEach((button) => {
      const isActive = button.dataset.panel === name;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    const tabs = $('.auth-tabs');
    if (tabs) tabs.classList.toggle('hidden', name === 'recovery');

    const back = $('#toLoginLink');
    if (back) back.classList.toggle('hidden', name !== 'recovery');

    const first = firstField($(`#panel-${name}`));
    if (first) setTimeout(() => first.focus(), 60);
  }

  const firstField = (panel) => panel && [...panel.querySelectorAll('input')].find((input) => input.type !== 'hidden');

  /* ---------------------------- أدوات الحقول ---------------------------- */
  function attachReveal(input) {
    const button = el('button', {
      type: 'button',
      class: 'reveal-btn',
      'aria-label': 'إظهار/إخفاء',
      text: '👁'
    });
    button.addEventListener('click', () => {
      const revealed = input.type === 'text';
      input.type = revealed ? 'password' : 'text';
      button.setAttribute('aria-label', revealed ? 'إظهار' : 'إخفاء');
      button.textContent = revealed ? '👁' : '🙈';
    });

    const wrapper = el('div', { class: 'secret-row' });
    input.before(wrapper);
    wrapper.append(input, button);
  }

  function randomSecret() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // ضمان وجود رقم وحرف كما يطلب الخادم
    let out = 'a1';
    for (let i = 2; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function strengthMeter(input, host) {
    const bars = [0, 1, 2, 3].map(() => el('span', { class: 'meter__bar' }));
    const label = el('span', { class: 'field__hint', text: 'مفتاح المرور: 16 رمزاً، يحوي حرفاً ورقماً' });
    host.append(el('div', { class: 'meter', 'aria-hidden': 'true' }, bars), label);

    input.addEventListener('input', () => {
      const value = input.value;
      const checks = [
        value.length === 16,
        /[A-Za-z]/.test(value),
        /\d/.test(value),
        /[^A-Za-z0-9]/.test(value)
      ];
      const score = checks.filter(Boolean).length;
      const cls = score <= 1 ? 'weak' : score === 2 ? 'mid' : 'good';
      bars.forEach((bar, index) => {
        bar.className = 'meter__bar';
        if (index < score) bar.classList.add(`is-on-${cls}`);
      });
      label.textContent = value.length === 0
        ? 'مفتاح المرور: 16 رمزاً، يحوي حرفاً ورقماً'
        : value.length !== 16
          ? `الطول ${value.length}/16`
          : ['ضعيف جداً', 'ضعيف', 'مقبول', 'جيد', 'قوي'][score];
    });
  }

  /* ------------------------------ المعالجات ------------------------------ */
  async function handleLogin(event) {
    event.preventDefault();
    const button = event.submitter || $('#loginSubmit');
    const username = $('#loginUsername').value.trim().toLowerCase();
    const pass_key = $('#loginPassKey').value;

    if (!username || !pass_key) { toast('املأ اسم المستخدم ومفتاح المرور.', 'error'); return; }

    button.disabled = true;
    try {
      const data = await api.login({ username, pass_key });
      store.token = data.token;
      localStorage.setItem('tg_user', JSON.stringify(data.user));
      await window.App.syncFavoriteIds();
      toast(data.message || 'أهلاً بك مجدداً', 'success', 1600);
      const next = new URLSearchParams(window.location.search).get('next');
      const safe = next && /^(index|favorites|admin)\.html$/.test(next) ? next : 'index.html';
      setTimeout(() => { window.location.href = safe; }, 650);
    } catch {
      $('#loginPassKey').value = '';
      $('#loginPassKey').focus();
    } finally {
      button.disabled = false;
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const button = event.submitter || $('#registerSubmit');
    const payload = {
      name: $('#regName').value.trim(),
      username: $('#regUsername').value.trim().toLowerCase(),
      pass_key: $('#regPassKey').value,
      Recovery_code: $('#regRecoveryCode').value
    };

    if (!payload.name || !payload.username || !payload.pass_key || !payload.Recovery_code) {
      toast('أكمل جميع الحقول قبل الإنشاء.', 'error');
      return;
    }
    if (!/^[a-z0-9_.]{4,15}$/.test(payload.username)) {
      toast('اسم المستخدم: أحرف إنجليزية صغيرة وأرقام و _ و . فقط، من 4 إلى 15 رمزاً.', 'error');
      $('#regUsername').focus();
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{16}$/.test(payload.pass_key)) {
      toast('مفتاح المرور يجب أن يكون 16 رمزاً بالضبط ويحتوي حرفاً ورقماً.', 'error');
      $('#regPassKey').focus();
      return;
    }
    if (payload.pass_key === payload.Recovery_code) {
      toast('كود الاسترجاع يجب أن يختلف عن مفتاح المرور.', 'error');
      return;
    }

    button.disabled = true;
    try {
      const data = await api.register(payload);
      store.token = data.token;
      localStorage.setItem('tg_user', JSON.stringify(data.user));
      showSecretOnce(data.user.username, payload.Recovery_code);
      toast('تم إنشاء الحساب بنجاح 🎉', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 2600);
    } catch {
      button.disabled = false;
      $('#regPassKey').focus();
    }
  }

  // لا تظهر هذه الرسالة إلا مرة واحدة لأن المستخدم وحده من يجب أن يحفظها
  function showSecretOnce(username, recoveryCode) {
    const notice = $('#recoveryNotice');
    if (!notice) return;
    notice.classList.remove('hidden');
    notice.textContent = '';
    notice.append(
      el('strong', { text: `تم إنشاء حساب ${username}.` }),
      el('p', { text: 'احفظ كود الاسترجاع في مكان آمن — هو الوسيلة الوحيدة لاسترجاع الحساب:' }),
      el('code', { class: 'notice__code', text: recoveryCode })
    );
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleRecoveryVerify(event) {
    event.preventDefault();
    const button = event.submitter || $('#recoveryVerifyBtn');
    const username = $('#recUsername').value.trim().toLowerCase();
    const Recovery_code = $('#recCode').value;

    if (!username || !Recovery_code) { toast('املأ الحقول للمتابعة.', 'error'); return; }

    button.disabled = true;
    try {
      const data = await api.recoveryVerify({ username, Recovery_code });
      recoveryToken = data.recoveryToken;
      toast(data.message, 'success');
      $('#recoveryStep1').classList.add('hidden');
      $('#recoveryStep2').classList.remove('hidden');
      $('#resetPassKey').focus();
    } catch { /* الرسالة في التبليغ */ }
    finally { button.disabled = false; }
  }

  async function handleRecoveryReset(event) {
    event.preventDefault();
    const button = event.submitter || $('#recoveryResetBtn');
    const pass_key = $('#resetPassKey').value;
    const Recovery_code = $('#newRecoveryCode').value;

    if (!recoveryToken) {
      toast('انتهت صلاحية التحقق، ابدأ من جديد.', 'error');
      backToLogin();
      return;
    }
    if (!pass_key || !Recovery_code) { toast('حدّد مفتاحاً جديداً وكود استرجاع جديدين.', 'error'); return; }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{16}$/.test(pass_key)) {
      toast('مفتاح المرور الجديد يجب أن يكون 16 رمزاً بالضبط ويحتوي حرفاً ورقماً.', 'error');
      $('#resetPassKey').focus();
      return;
    }
    if (pass_key === Recovery_code) { toast('يجب أن يختلف الكود عن المفتاح.', 'error'); return; }

    button.disabled = true;
    try {
      const data = await api.recoveryReset({ recoveryToken, pass_key, Recovery_code });
      recoveryToken = '';
      store.token = data.token;
      toast('تم تعيين مفتاح جديد وكود استرجاع جديد 🔒', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 1800);
    } catch {
      button.disabled = false;
    }
  }

  function backToLogin() {
    recoveryToken = '';
    $('#recoveryStep1').classList.remove('hidden');
    $('#recoveryStep2').classList.add('hidden');
    showPanel('login');
  }

  /* -------------------------------- الإقلاع ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    window.App.boot({ active: '' });

    $('#tabLogin')?.addEventListener('click', () => showPanel('login'));
    $('#tabRegister')?.addEventListener('click', () => showPanel('register'));
    $('#forgotLink')?.addEventListener('click', () => showPanel('recovery'));
    $('#toLoginLink')?.addEventListener('click', (event) => { event.preventDefault(); backToLogin(); });

    $('#panel-login')?.addEventListener('submit', handleLogin);
    $('#panel-register')?.addEventListener('submit', handleRegister);
    $('#formRecoveryVerify')?.addEventListener('submit', handleRecoveryVerify);
    $('#formRecoveryReset')?.addEventListener('submit', handleRecoveryReset);

    ['#loginPassKey', '#regPassKey', '#recCode', '#resetPassKey', '#newRecoveryCode']
      .forEach((selector) => {
        const input = $(selector);
        if (input) attachReveal(input);
      });

    $('#regGenerate')?.addEventListener('click', () => {
      const input = $('#regPassKey');
      input.value = randomSecret();
      input.dispatchEvent(new Event('input'));
      toast('تم توليد مفتاح عشوائي قوي — انسخه قبل مغادرة الصفحة.', 'info', 6000);
    });

    $('#resetGenerate')?.addEventListener('click', () => {
      const input = $('#newRecoveryCode');
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      input.value = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      input.dispatchEvent(new Event('input'));
    });

    strengthMeter($('#regPassKey'), $('#regStrength'));
    strengthMeter($('#resetPassKey'), $('#resetStrength'));

    if (store.token) {
      api.me().then((data) => {
        const notice = $('#alreadyLoggedIn');
        if (!notice) return;
        notice.classList.remove('hidden');
        notice.textContent = '';
        notice.append(
          el('strong', { text: `أنت مسجّل الدخول كـ ${data.user.username}` }),
          el('div', { class: 'hero__actions', style: 'margin-top:10px' }, [
            el('a', { class: 'btn btn--primary btn--sm', href: 'index.html', text: 'الذهاب للمتجر' }),
            el('button', {
              type: 'button', class: 'btn btn--ghost btn--sm',
              onclick: () => window.App.logout(), text: 'خروج من هذا الحساب'
            })
          ])
        );
      }).catch(() => { store.token = ''; });
    }

    if (new URLSearchParams(window.location.search).get('mode') === 'register') showPanel('register');
    else if (new URLSearchParams(window.location.search).get('mode') === 'recovery') showPanel('recovery');
  });
})();
