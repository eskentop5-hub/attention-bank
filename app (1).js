// ATTENTION BANK — клиент (Web + PWA). Без фреймворков и сборки.
// Важно: клиент НИКОГДА не меняет баланс сам — только показывает то, что вернул сервер.

const state = { me: null, meta: null, unread: 0, lastSeenNotif: 0, poll: null, tgPoll: null, onReward: null };
const app = document.getElementById('app');

// ---------- Утилиты ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);
const signed = (n) => (n > 0 ? `+${fmt(n)}` : `−${fmt(Math.abs(n))}`);
const fmtDate = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const minutes = (sec) => (sec < 60 ? `${sec} сек` : `${Math.round(sec / 60)} мин`);
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Ошибка ${res.status}`, res.status, data.details);
  return data;
}

function toast(message, { kind = 'ok', stamp = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast${kind === 'err' ? ' err' : ''}`;
  el.innerHTML = `${stamp ? `<span class="stamp press">${esc(stamp)}</span>` : ''}<span>${esc(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 4500);
}

const icon = {
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6l9-3 1 3"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  tg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.9-1.4-1.5ZM8.6 14l9.2-5.8c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2L8.6 14Z"/></svg>',
};

// ---------- Каркас ----------
function navItems() {
  const r = state.me?.role;
  if (r === 'user')
    return [
      ['#/tasks', 'Задания', icon.tasks],
      ['#/wallet', 'Кошелёк', icon.wallet],
      ['#/rewards', 'Награды', icon.gift],
      ['#/profile', 'Профиль', icon.user],
    ];
  if (r === 'company')
    return [
      ['#/company', 'Кампании', icon.chart],
      ['#/company/new', 'Создать', icon.plus],
      ['#/company/rewards', 'Награды', icon.gift],
      ['#/wallet', 'Бюджет', icon.wallet],
      ['#/profile', 'Профиль', icon.user],
    ];
  return [];
}

function renderChrome() {
  const path = location.hash || '#/';
  const items = navItems();
  const current = (href) => {
    if (href === '#/company') return path === '#/company' || path.startsWith('#/company/campaigns');
    return path === href || path.startsWith(href + '/');
  };
  $('#nav').innerHTML = items
    .map(([h, l]) => `<a href="${h}" ${current(h) ? 'aria-current="page"' : ''}>${l}</a>`)
    .join('');
  $('#tabbar').innerHTML = items
    .map(([h, l, i]) => `<a href="${h}" ${current(h) ? 'aria-current="page"' : ''}>${i}<span>${l}</span></a>`)
    .join('');
  $('#tabbar').hidden = items.length === 0;
  const me = state.me;
  $('#top-actions').innerHTML = me
    ? `<a class="bell" href="#/notifications" aria-label="Уведомления${state.unread ? `: ${state.unread} новых` : ''}">${icon.bell}${
        state.unread ? `<span class="dot">${state.unread > 9 ? '9+' : state.unread}</span>` : ''
      }</a>
       <a class="pill" href="#/wallet" title="Баланс">${fmt(me.balance)} AB</a>`
    : `<a class="pill" href="#/login">Войти</a>`;
}

async function refreshMe() {
  const { user, unread } = await api('/api/me');
  state.me = user;
  state.unread = unread || 0;
  return user;
}

// Фоновая проверка уведомлений: сообщение о начислении появляется сразу после одобрения
function startPolling() {
  stopPolling();
  state.poll = setInterval(async () => {
    if (!state.me || document.hidden) return;
    try {
      const prevBalance = state.me.balance;
      const prevUnread = state.unread;
      await refreshMe();
      if (!state.me) return renderChrome();
      if (state.unread > prevUnread) {
        const { notifications } = await api('/api/notifications');
        notifications
          .filter((n) => !n.read_at && n.id > state.lastSeenNotif)
          .slice(0, 3)
          .reverse()
          .forEach((n) => toast(n.body, { stamp: n.kind === 'reward' ? n.title : null }));
        state.lastSeenNotif = Math.max(state.lastSeenNotif, ...notifications.map((n) => n.id));
      }
      renderChrome();
      if (state.me.balance !== prevBalance && state.onReward) state.onReward();
    } catch {
      /* сеть недоступна — попробуем позже */
    }
  }, 10000);
}
const stopPolling = () => clearInterval(state.poll);

// ---------- Роутер ----------
const routes = [
  ['/', viewLanding, { guest: true }],
  ['/login', viewLogin, { guest: true }],
  ['/register', viewRegister, { guest: true }],
  ['/onboarding', viewOnboarding, { role: 'user' }],
  ['/tasks', viewTasks, { role: 'user' }],
  ['/tasks/:id', viewTask, { role: 'user' }],
  ['/rewards', viewRewards, { role: 'user' }],
  ['/wallet', viewWallet, { auth: true }],
  ['/profile', viewProfile, { auth: true }],
  ['/notifications', viewNotifications, { auth: true }],
  ['/company', viewCompany, { role: 'company' }],
  ['/company/new', viewNewCampaign, { role: 'company' }],
  ['/company/campaigns/:id', viewCampaign, { role: 'company' }],
  ['/company/rewards', viewCompanyRewards, { role: 'company' }],
];

const home = () => (state.me?.role === 'company' ? '#/company' : '#/tasks');

async function router() {
  clearInterval(state.tgPoll);
  clearInterval(state.timer);
  state.onReward = null;
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let found = null;
  for (const [pattern, view, opts] of routes) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    const m = path.match(re);
    if (m) {
      found = { view, opts, params: Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])) };
      break;
    }
  }
  if (!found) return void (location.hash = state.me ? home() : '#/');
  const { view, opts, params } = found;
  if ((opts.auth || opts.role) && !state.me) return void (location.hash = `#/login?next=${encodeURIComponent(path)}`);
  if (opts.role && state.me.role !== opts.role) return void (location.hash = home());
  if (opts.guest && state.me && path !== '/') return void (location.hash = home());

  renderChrome();
  app.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    await view({ params, query });
  } catch (e) {
    if (e.status === 401) {
      state.me = null;
      return void (location.hash = '#/login');
    }
    app.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><a class="btn btn-ghost" href="${home()}">Вернуться</a></div>`;
  }
  window.scrollTo(0, 0);
}

// ---------- Формы ----------
function formData(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) (data[el.name] ||= []), el.checked && data[el.name].push(el.value);
      else data[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else data[el.name] = el.value;
  }
  return data;
}

function showFormError(form, err) {
  $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
  $$('.err', form).forEach((e) => e.remove());
  let box = $('.form-error', form);
  if (!box) {
    box = document.createElement('div');
    box.className = 'form-error';
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  box.textContent = err.message;
  if (err.details && typeof err.details === 'object') {
    for (const [k, msg] of Object.entries(err.details)) {
      const field = $(`[data-q="${k}"]`, form);
      if (field) {
        field.classList.add('invalid');
        field.insertAdjacentHTML('beforeend', `<span class="err">${esc(msg)}</span>`);
      }
    }
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindForm(form, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn && (btn.disabled = true);
    try {
      await handler(formData(form));
    } catch (err) {
      showFormError(form, err);
    } finally {
      btn && (btn.disabled = false);
    }
  });
}

const interestChips = (selected = [], name = 'interests') =>
  `<div class="chips">${state.meta.interests
    .map(
      (i) =>
        `<label class="chip"><input type="checkbox" name="${name}" value="${i.id}" data-multi="1" ${selected.includes(i.id) ? 'checked' : ''}><span>${esc(i.label)}</span></label>`
    )
    .join('')}</div>`;

const interestLabel = (id) => state.meta.interests.find((i) => i.id === id)?.label || id;

// ===================================================================
//                              ЛЕНДИНГ
// ===================================================================
async function viewLanding() {
  const stats = await api('/api/stats').catch(() => null);
  const me = state.me;
  const fee = state.meta.economy.platformFeePercent;
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Внимание — это вклад. Платят за подтверждённый результат.</h1>
      <p class="lead">ATTENTION BANK соединяет разработчиков игр и приложений с людьми, которые хотят тестировать новое. Компания платит только за ответ, прошедший проверку. Участник получает AB Points и меняет их на награды от тех же студий.</p>
      <div class="cta-row">
        ${
          me
            ? `<a class="btn btn-primary" href="${home()}">${me.role === 'company' ? 'Открыть кабинет' : 'Открыть задания'}</a>`
            : `<a class="btn btn-primary" href="#/register">Начать тестировать</a>
               <a class="btn btn-ghost" href="#/register?role=company">Я разработчик</a>`
        }
      </div>
      ${
        stats
          ? `<div class="statline">
        <div><b>${fmt(stats.verifiedResults)}</b>подтверждённых результатов</div>
        <div><b>${fmt(stats.paidOut)} AB</b>выплачено участникам</div>
        <div><b>${fmt(stats.activeCampaigns)}</b>активных заданий</div>
      </div>`
          : ''
      }
    </div>
    <div class="passbook" aria-label="Пример журнала транзакций">
      <div class="passbook-head"><span>Журнал транзакций</span><span>AB Points</span></div>
      ${[
        ['Game Feedback', 'Плейтест Steppe Runner', 50, 'Completed'],
        ['App Testing', 'Онбординг приложения Qadam', 100, 'Completed'],
        ['Награда', 'Ключ раннего доступа', -80, 'Redeemed'],
      ]
        .map(
          ([t, s, a, st], i) => `
        <div class="passbook-row reveal" style="animation-delay:${0.25 + i * 0.35}s">
          <b>${esc(t)}</b><span class="amt" style="color:var(${a > 0 ? '--green' : '--red'})">${signed(a)}</span>
          <div class="sub"><span>${esc(s)}</span><span>${st}</span></div>
        </div>`
        )
        .join('')}
      <div class="passbook-row reveal" style="animation-delay:1.4s">
        <b>Баланс</b><span class="amt">70</span>
        <div class="sub"><span>Сверено с журналом: 70 = 70</span><span class="stamp" style="font-size:.6rem">ПОДТВЕРЖДЕНО</span></div>
      </div>
    </div>
  </section>

  <section class="band">
    <h2>Как это работает</h2>
    <ol class="flow" style="padding:0;margin:24px 0 0">
      <li><b>Компания создаёт задачу</b><span>Плейтест, отзыв, UX-тест. Бюджет резервируется сразу.</span></li>
      <li><b>Участник выполняет</b><span>Задание подбирается по интересам. Время выполнения фиксирует сервер.</span></li>
      <li><b>Сервер проверяет</b><span>Время, формальные ответы, дубликаты, репутация. Затем решение компании.</span></li>
      <li><b>Начисляются AB Points</b><span>Только транзакцией на сервере. Клиент не может изменить баланс.</span></li>
      <li><b>Все получают итог</b><span>Участнику приходит уведомление в Telegram, компании — проверенный результат.</span></li>
    </ol>
  </section>

  <section class="band">
    <h2>Это не «опросы за баллы»</h2>
    <p class="muted">Мы продаём компаниям не просмотры и не анкеты, а подтверждённое тестирование, обратную связь и заинтересованную аудиторию.</p>
    <div class="compare">
      <div>
        <h3>Обычные reward-платформы</h3>
        <ul>
          <li>Платят за любой ответ</li>
          <li>Проверка качества на стороне заказчика</li>
          <li>Случайная аудитория без интереса к продукту</li>
          <li>Баллы, которые не на что потратить</li>
          <li>Легко создать десятки аккаунтов</li>
        </ul>
      </div>
      <div>
        <h3>ATTENTION BANK</h3>
        <ul>
          <li>Компания платит только за одобренный результат, остаток бюджета возвращается</li>
          <li>Автопроверка каждого ответа и оценка качества 0–100</li>
          <li>Участники, которые сами выбрали игры и приложения</li>
          <li>Награды от самих студий: ключи раннего доступа, скины, премиум</li>
          <li>Один Telegram — один аккаунт, репутация участника видна компании</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="band grid grid-2">
    <div>
      <h2>Начинаем с одной ниши</h2>
      <p><b>Gaming & Digital Product Testing.</b> Первые компании — небольшие студии, разработчики приложений и студенческие стартапы, которым нужен честный фидбек до релиза. Первые участники — геймеры и tech-аудитория, которым интересно попробовать новое раньше всех.</p>
    </div>
    <div>
      <h2>Как зарабатывает платформа</h2>
      <p>Компания резервирует бюджет: награда участнику плюс комиссия платформы (сейчас ${fee}% от награды). Комиссия списывается только за подтверждённые результаты. Это иллюстративная модель MVP — проценты будут уточнены на реальной экономике.</p>
    </div>
  </section>

  <footer class="footer">ATTENTION BANK — MVP для хакатона. Участие с 16 лет, по согласию на обработку данных.</footer>`;
}

// ===================================================================
//                           ВХОД / РЕГИСТРАЦИЯ
// ===================================================================
async function afterAuth(user, next) {
  state.me = user;
  state.lastSeenNotif = 0;
  await refreshMe();
  startPolling();
  if (next) location.hash = '#' + next;
  else if (user.role === 'user' && user.interests.length === 0) location.hash = '#/onboarding';
  else location.hash = home();
}

async function viewLogin({ query }) {
  app.innerHTML = `
  <div class="auth">
    <h1>Вход</h1>
    <form class="sheet stack" id="f" novalidate>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-block" type="submit">Войти</button>
      <p class="small muted" style="margin:0">Нет аккаунта? <a href="#/register">Зарегистрируйтесь</a></p>
    </form>
    <div class="demo-box">
      Демо-доступ (пароль <b>demo1234</b>):<br>
      <button type="button" data-demo="demo@attention.bank">участник Айгерим</button> ·
      <button type="button" data-demo="studio@attention.bank">студия Nomad Pixel</button>
    </div>
  </div>`;
  const form = $('#f');
  bindForm(form, async (d) => {
    const { user } = await api('/api/auth/login', { method: 'POST', body: d });
    await afterAuth(user, query.next);
  });
  $$('[data-demo]').forEach((b) =>
    b.addEventListener('click', () => {
      form.email.value = b.dataset.demo;
      form.password.value = 'demo1234';
      form.requestSubmit();
    })
  );
}

async function viewRegister({ query }) {
  const role = query.role === 'company' ? 'company' : 'user';
  app.innerHTML = `
  <div class="auth">
    <h1>${role === 'company' ? 'Аккаунт компании' : 'Регистрация участника'}</h1>
    <div class="seg" role="tablist">
      <a href="#/register" aria-current="${role === 'user'}">Я участник</a>
      <a href="#/register?role=company" aria-current="${role === 'company'}">Я компания</a>
    </div>
    <form class="sheet stack" id="f" novalidate>
      <input type="hidden" name="role" value="${role}">
      ${role === 'company' ? '<label class="field"><span>Название студии или компании</span><input class="input" name="companyName" required></label>' : ''}
      <label class="field"><span>${role === 'company' ? 'Контактное лицо' : 'Имя'}</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required><small>Минимум 8 символов</small></label>
      ${role === 'user' ? '<label class="check"><input type="checkbox" name="ageConfirmed"> Мне есть 16 лет</label>' : ''}
      <label class="check"><input type="checkbox" name="consent"> Согласен(на) на обработку данных: ответы передаются компании-заказчику без email и контактов</label>
      <button class="btn btn-primary btn-block" type="submit">Создать аккаунт</button>
      <p class="small muted" style="margin:0">Уже есть аккаунт? <a href="#/login">Войти</a></p>
    </form>
  </div>`;
  bindForm($('#f'), async (d) => {
    const { user } = await api('/api/auth/register', { method: 'POST', body: d });
    toast('Аккаунт создан');
    await afterAuth(user);
  });
}

async function viewOnboarding() {
  app.innerHTML = `
  <div class="auth" style="max-width:640px">
    <h1>Что вам интересно?</h1>
    <p class="muted">По интересам мы подбираем задания. Выберите хотя бы одно — изменить можно в профиле.</p>
    <form class="sheet stack" id="f">
      ${interestChips(state.me.interests)}
      <button class="btn btn-primary" type="submit">Показать задания</button>
    </form>
  </div>`;
  bindForm($('#f'), async (d) => {
    if (!d.interests?.length) throw new Error('Выберите хотя бы один интерес');
    const { user } = await api('/api/me', { method: 'PUT', body: { interests: d.interests } });
    state.me = user;
    location.hash = '#/tasks';
  });
}

// ===================================================================
//                         УЧАСТНИК: ЗАДАНИЯ
// ===================================================================
const statusTag = (s) =>
  ({
    started: '<span class="tag tag-blue">В процессе</span>',
    submitted: '<span class="tag tag-amber">На проверке</span>',
    approved: '<span class="tag tag-green">Одобрено</span>',
    rejected: '<span class="tag tag-red">Не принято</span>',
  })[s] || '';

async function viewTasks({ query }) {
  const tab = query.tab === 'mine' ? 'mine' : 'open';
  const [{ tasks }, { submissions }] = await Promise.all([api('/api/tasks'), api('/api/my/submissions')]);
  const onlyMine = query.all !== '1';
  const open = tasks.filter((t) => !t.my && (!onlyMine || t.matches));
  const hidden = tasks.filter((t) => !t.my && !t.matches).length;
  const tgOff = !state.me.telegram.linked;

  const card = (t) => `
    <a class="task ${t.my?.status === 'approved' ? 'done' : t.my?.status === 'rejected' ? 'dim' : ''}" href="#/tasks/${t.id}">
      <div>
        <div class="task-meta"><span class="tag">${esc(t.categoryLabel)}</span><span>${esc(t.company)}</span>${t.my ? statusTag(t.my.status) : ''}${
          t.requireTelegram ? '<span class="tag tag-blue">Нужен Telegram</span>' : ''
        }</div>
        <h3>${esc(t.title)}</h3>
        <div class="task-meta"><span>Осталось мест: ${t.slotsLeft} из ${t.maxParticipants}</span><span>от ${minutes(t.minSeconds)}</span>${
          t.autoApprove ? '<span>автоодобрение</span>' : '<span>проверяет компания</span>'
        }</div>
      </div>
      <div class="reward">+${fmt(t.reward)} AB<small>за подтверждённый результат</small></div>
    </a>`;

  app.innerHTML = `
  <div class="page-head">
    <div><h1>Задания</h1><p class="muted">Тестируйте игры и приложения. AB Points начисляются после проверки.</p></div>
  </div>
  ${
    tgOff
      ? `<div class="sheet row" style="margin-bottom:16px"><span class="tg-icon" style="width:36px;height:36px">${icon.tg}</span>
         <div style="flex:1;min-width:220px"><b>Подключите Telegram</b><div class="small muted">Уведомления о начислениях придут сразу, а подтверждённый аккаунт получает больше заданий${
           state.meta.telegram.verifyBonus ? ` и бонус +${state.meta.telegram.verifyBonus} AB` : ''
         }.</div></div>
         <a class="btn btn-ghost btn-sm" href="#/profile">Подключить</a></div>`
      : ''
  }
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected="${tab === 'open'}" data-tab="open">Доступные (${open.length})</button>
    <button role="tab" aria-selected="${tab === 'mine'}" data-tab="mine">Мои (${submissions.length})</button>
  </div>
  <div id="list"></div>`;

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => (location.hash = `#/tasks?tab=${b.dataset.tab}`)));
  const list = $('#list');
  if (tab === 'open') {
    list.innerHTML = open.length
      ? `<div class="tasks">${open.map(card).join('')}</div>${
          onlyMine && hidden ? `<p class="small muted" style="margin-top:16px">Ещё ${hidden} ${plural(hidden, 'задание', 'задания', 'заданий')} вне ваших интересов. <a href="#/tasks?all=1">Показать все</a></p>` : ''
        }`
      : `<div class="empty"><p>Сейчас нет новых заданий${onlyMine ? ' по вашим интересам' : ''}. Добавьте интересы — заданий станет больше.</p>
         <div class="row" style="justify-content:center">${onlyMine && hidden ? '<a class="btn btn-ghost" href="#/tasks?all=1">Показать все задания</a>' : ''}<a class="btn btn-primary" href="#/profile">Изменить интересы</a></div></div>`;
  } else {
    list.innerHTML = submissions.length
      ? `<div class="tasks">${submissions
          .map(
            (s) => `
        <a class="task ${s.status === 'approved' ? 'done' : s.status === 'rejected' ? 'dim' : ''}" href="#/tasks/${s.campaignId}">
          <div><div class="task-meta"><span class="tag">${esc(s.categoryLabel)}</span>${statusTag(s.status)}</div>
          <h3>${esc(s.title)}</h3>
          <div class="task-meta">${s.submittedAt ? `Отправлено ${fmtDate(s.submittedAt)}` : `Начато ${fmtDate(s.startedAt)}`}${
            s.reviewNote ? ` · ${esc(s.reviewNote)}` : ''
          }</div></div>
          <div class="reward" style="color:${s.status === 'approved' ? 'var(--green)' : 'var(--muted)'}">+${fmt(s.reward)} AB</div>
        </a>`
          )
          .join('')}</div>`
      : `<div class="empty"><p>Вы ещё не выполняли заданий.</p><a class="btn btn-primary" href="#/tasks">Выбрать задание</a></div>`;
  }
}

function questionInput(q, value, disabled) {
  const dis = disabled ? 'disabled' : '';
  if (q.type === 'rating')
    return `<div class="scale" role="radiogroup" aria-label="${esc(q.label)}">${[1, 2, 3, 4, 5]
      .map((n) => `<label><input type="radio" name="${q.id}" value="${n}" ${value == n ? 'checked' : ''} ${dis}><span>${n}</span></label>`)
      .join('')}</div><div class="scale-legend"><span>Совсем нет</span><span>Отлично</span></div>`;
  if (q.type === 'choice')
    return `<div class="options">${q.options
      .map((o) => `<label class="option"><input type="radio" name="${q.id}" value="${esc(o)}" ${value === o ? 'checked' : ''} ${dis}>${esc(o)}</label>`)
      .join('')}</div>`;
  return `<textarea class="input" name="${q.id}" data-min="${q.minLength ?? 30}" ${dis} placeholder="Опишите конкретно: что делали, что увидели, что мешало">${esc(value ?? '')}</textarea>
          ${disabled ? '' : `<div class="counter" data-counter="${q.id}"></div>`}`;
}

async function viewTask({ params }) {
  const { task: t } = await api(`/api/tasks/${params.id}`);
  const my = t.my;
  const status = my?.status;

  let action = '';
  if (!my) {
    action = `
      <div class="sheet">
        <h3>Готовы начать?</h3>
        <p class="small muted">После нажатия сервер зафиксирует время начала. Ответ, отправленный быстрее чем за ${minutes(t.minSeconds)}, получит пониженную оценку качества.</p>
        ${
          t.requireTelegram && !state.me.telegram.linked
            ? `<p class="small">Для этого задания нужен аккаунт, подтверждённый через Telegram.</p><a class="btn btn-primary" href="#/profile">Подключить Telegram</a>`
            : `<button class="btn btn-primary btn-block" id="start">Начать задание</button>`
        }
      </div>`;
  } else if (status === 'started') {
    action = '';
  } else {
    const stamp =
      status === 'approved'
        ? `<span class="stamp big ${state.justSubmitted ? 'press' : ''}">ПОДТВЕРЖДЕНО +${t.reward} AB</span>`
        : status === 'rejected'
          ? `<span class="stamp big red ${state.justSubmitted ? 'press' : ''}">НЕ ПРИНЯТО</span>`
          : `<span class="stamp big blue ${state.justSubmitted ? 'press' : ''}">НА ПРОВЕРКЕ</span>`;
    action = `
      <div class="sheet stack">
        <div>${stamp}</div>
        ${
          status === 'submitted'
            ? `<p class="small">Компания проверяет ответ. Когда его одобрят, AB Points придут на баланс${state.me.telegram.linked ? ', а в Telegram — уведомление' : ''}.</p>`
            : ''
        }
        ${status === 'approved' ? `<p class="small">Награда начислена транзакцией. <a href="#/wallet">Открыть кошелёк</a></p>` : ''}
        ${my.reviewNote ? `<p class="small"><b>Комментарий:</b> ${esc(my.reviewNote)}</p>` : ''}
        ${
          my.autoScore != null
            ? `<p class="small muted" style="margin:0">Автопроверка: ${my.autoScore}/100${my.flags.length ? ` · ${my.flags.map((f) => esc(f.label)).join(', ')}` : ''}</p>`
            : ''
        }
      </div>`;
  }
  state.justSubmitted = false;

  app.innerHTML = `
  <p><a href="#/tasks">Все задания</a></p>
  <div class="split">
    <div class="stack">
      <div class="sheet">
        <div class="task-meta"><span class="tag">${esc(t.categoryLabel)}</span><span>${esc(t.company)}</span>${status ? statusTag(status) : ''}</div>
        <h1 style="margin-top:10px">${esc(t.title)}</h1>
        <p>${esc(t.description)}</p>
        ${t.productUrl ? `<a class="btn btn-ghost" href="${esc(t.productUrl)}" target="_blank" rel="noopener noreferrer">Открыть продукт для теста</a>` : ''}
      </div>
      ${
        my
          ? `<form class="sheet" id="answers" novalidate>
        <div class="row" style="margin-bottom:8px"><h2 style="margin:0">Ваши ответы</h2><span class="spacer"></span>${
          status === 'started' ? `<span class="small muted">Время: <span class="timer" id="timer">0:00</span></span>` : ''
        }</div>
        ${t.questions
          .map(
            (q) => `<div class="question field" data-q="${q.id}">
              <span class="question-label">${esc(q.label)}${q.required ? '' : ' <span class="muted">(необязательно)</span>'}</span>
              ${questionInput(q, my.answers?.[q.id], status !== 'started')}
            </div>`
          )
          .join('')}
        ${status === 'started' ? '<button class="btn btn-primary btn-block" type="submit">Отправить результат</button>' : ''}
      </form>`
          : `<div class="sheet"><h2>Что нужно ответить</h2><ol style="margin:0;padding-left:20px">${t.questions.map((q) => `<li style="margin-bottom:6px">${esc(q.label)}</li>`).join('')}</ol></div>`
      }
    </div>
    <aside class="stack">
      <div class="sheet">
        <div class="reward" style="text-align:left;font-size:2rem">+${fmt(t.reward)} AB</div>
        <p class="small muted" style="margin:4px 0 14px">Начисляются после проверки ответа${t.autoApprove ? ' (автоодобрение при оценке качества от 70)' : ' компанией'}.</p>
        <dl class="small" style="display:grid;grid-template-columns:1fr auto;gap:6px;margin:0">
          <dt class="muted">Мест осталось</dt><dd style="margin:0">${t.slotsLeft} из ${t.maxParticipants}</dd>
          <dt class="muted">Минимальное время</dt><dd style="margin:0">${minutes(t.minSeconds)}</dd>
          <dt class="muted">Аудитория</dt><dd style="margin:0;text-align:right">${t.audience.length ? t.audience.map(interestLabel).map(esc).join(', ') : 'все'}</dd>
        </dl>
      </div>
      ${action}
    </aside>
  </div>`;

  $('#start')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await api(`/api/tasks/${t.id}/start`, { method: 'POST', body: {} });
      viewTask({ params });
    } catch (err) {
      toast(err.message, { kind: 'err' });
      e.target.disabled = false;
    }
  });

  if (status === 'started') {
    const started = new Date(my.startedAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const el = $('#timer');
      if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    state.timer = setInterval(tick, 1000);
    // Счётчики символов
    $$('textarea[data-min]').forEach((ta) => {
      const c = $(`[data-counter="${ta.name}"]`);
      const upd = () => {
        const n = ta.value.trim().length;
        const min = Number(ta.dataset.min);
        c.textContent = n >= min ? `${n} символов` : `${n} / минимум ${min}`;
        c.classList.toggle('ok', n >= min);
      };
      ta.addEventListener('input', upd);
      upd();
    });
    bindForm($('#answers'), async (d) => {
      const res = await api(`/api/tasks/${t.id}/submit`, { method: 'POST', body: { answers: d } });
      await refreshMe();
      renderChrome();
      state.justSubmitted = true;
      if (res.outcome === 'approved') toast(`Ответ одобрен автоматически. Баланс: ${state.me.balance} AB`, { stamp: `+${t.reward} AB` });
      else if (res.outcome === 'rejected') toast('Ответ не прошёл автопроверку', { kind: 'err' });
      else toast('Результат отправлен на проверку');
      viewTask({ params });
    });
  }
  if (status === 'submitted') state.onReward = () => viewTask({ params });
}

// ===================================================================
//                       КОШЕЛЁК И ТРАНЗАКЦИИ
// ===================================================================
const TX_LABEL = {
  task_reward: ['Задание', 'Completed'],
  bonus: ['Бонус', 'Completed'],
  redemption: ['Награда', 'Redeemed'],
  deposit: ['Пополнение', 'Completed'],
  campaign_reserve: ['Резерв кампании', 'Reserved'],
  campaign_refund: ['Возврат бюджета', 'Refunded'],
  platform_fee: ['Комиссия', 'Completed'],
};

async function viewWallet() {
  const w = await api('/api/wallet');
  state.me.balance = w.balance;
  renderChrome();
  const isCompany = state.me.role === 'company';
  const kzt = state.meta.economy.abToKzt;
  app.innerHTML = `
  <div class="page-head"><div><h1>${isCompany ? 'Бюджет' : 'Кошелёк'}</h1><p class="muted">Каждое изменение баланса — отдельная транзакция на сервере.</p></div></div>
  <div class="split">
    <div class="sheet">
      <h2>Транзакции</h2>
      ${
        w.transactions.length
          ? `<table class="ledger">
        <thead><tr><th>Операция</th><th style="text-align:right">Сумма</th><th>Статус</th><th style="text-align:right">Остаток</th></tr></thead>
        <tbody>${w.transactions
          .map((t) => {
            const [label, st] = TX_LABEL[t.type] || [t.type, t.status];
            return `<tr>
            <td><b>${esc(t.title)}</b><div class="small muted">${label} · ${fmtDate(t.created_at)}</div></td>
            <td class="amt ${t.amount > 0 ? 'plus' : 'minus'}">${signed(t.amount)} AB</td>
            <td><span class="tag ${st === 'Redeemed' || st === 'Reserved' ? 'tag-blue' : 'tag-green'}">${st}</span></td>
            <td class="bal">${fmt(t.balance_after)}</td></tr>`;
          })
          .join('')}</tbody></table>`
          : `<div class="empty"><p>Транзакций пока нет.${isCompany ? ' Пополните бюджет, чтобы создать первую кампанию.' : ' Выполните первое задание.'}</p><a class="btn btn-primary" href="${
              isCompany ? '#/company' : '#/tasks'
            }">${isCompany ? 'Пополнить бюджет' : 'Выбрать задание'}</a></div>`
      }
    </div>
    <aside class="stack">
      <div class="note">
        <div class="note-top"><span>${isCompany ? esc(state.me.companyName) : esc(state.me.name)}</span><span class="note-serial">AB № ${String(state.me.id).padStart(6, '0')}</span></div>
        <div class="note-amount">${fmt(w.balance)}<small>AB</small></div>
        <div class="note-bottom"><span>${isCompany ? `≈ ${fmt(w.balance * kzt)} ₸` : 'AB Points'}</span>${w.integrity.ok ? '<span class="stamp">СВЕРЕНО</span>' : ''}</div>
      </div>
      <div class="integrity ${w.integrity.ok ? '' : 'bad'}">
        ${w.integrity.ok ? `Баланс совпадает с журналом: ${fmt(w.integrity.cached)} = сумма ${w.transactions.length} ${plural(w.transactions.length, 'транзакции', 'транзакций', 'транзакций')}` : `Расхождение: ${w.integrity.cached} ≠ ${w.integrity.computed}`}
      </div>
      ${!isCompany ? `<a class="btn btn-primary btn-block" href="#/rewards">Потратить на награды</a>` : ''}
    </aside>
  </div>`;
}

// ===================================================================
//                            НАГРАДЫ
// ===================================================================
async function viewRewards() {
  const { rewards, mine } = await api('/api/rewards');
  const bal = state.me.balance;
  app.innerHTML = `
  <div class="page-head"><div><h1>Награды</h1><p class="muted">Награды добавляют сами студии и сервисы. Ваш баланс: <b>${fmt(bal)} AB</b></p></div></div>
  <div class="rewards">${rewards
    .map(
      (r) => `
    <div class="ticket">
      <div class="small muted">${esc(r.company)}</div>
      <h3 style="margin:0">${esc(r.title)}</h3>
      <p class="small" style="margin:0">${esc(r.description)}</p>
      <div class="foot">
        <span class="cost">${fmt(r.cost)} AB</span>
        ${
          r.stock <= 0
            ? '<span class="tag">Закончилось</span>'
            : bal >= r.cost
              ? `<button class="btn btn-primary btn-sm" data-redeem="${r.id}" data-cost="${r.cost}">Обменять</button>`
              : `<span class="small muted">не хватает ${fmt(r.cost - bal)}</span>`
        }
      </div>
    </div>`
    )
    .join('')}</div>
  <h2 style="margin-top:36px">Мои награды</h2>
  ${
    mine.length
      ? `<div class="sheet"><table class="table"><tbody>${mine
          .map((m) => `<tr><td><b>${esc(m.title)}</b><div class="small muted">${fmtDate(m.created_at)} · −${m.cost} AB</div></td><td style="text-align:right"><span class="code">${esc(m.code)}</span></td></tr>`)
          .join('')}</tbody></table></div>`
      : '<p class="muted">Пока пусто. Обменяйте AB Points на первую награду.</p>'
  }`;
  $$('[data-redeem]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!b.dataset.confirm) {
        b.dataset.confirm = '1';
        b.textContent = `Списать ${b.dataset.cost} AB`;
        b.classList.replace('btn-primary', 'btn-ok');
        return;
      }
      b.disabled = true;
      try {
        const res = await api(`/api/rewards/${b.dataset.redeem}/redeem`, { method: 'POST', body: {} });
        state.me.balance = res.balance;
        renderChrome();
        toast(`Ваш код: ${res.code}`, { stamp: 'ПОЛУЧЕНО' });
        viewRewards();
      } catch (e) {
        toast(e.message, { kind: 'err' });
        b.disabled = false;
      }
    })
  );
}

// ===================================================================
//                         ПРОФИЛЬ И TELEGRAM
// ===================================================================
async function viewProfile() {
  await refreshMe();
  const me = state.me;
  const tg = me.telegram;
  app.innerHTML = `
  <div class="page-head"><div><h1>Профиль</h1><p class="muted">${esc(me.email)}${me.role === 'company' ? ` · ${esc(me.companyName)}` : ''}</p></div>
    <button class="btn btn-ghost" id="logout">Выйти</button></div>
  <div class="grid grid-2" style="align-items:start">
    <form class="sheet stack" id="f">
      <h2>Данные</h2>
      <label class="field"><span>Имя</span><input class="input" name="name" value="${esc(me.name)}"></label>
      ${me.role === 'user' ? `<div class="field"><span>Интересы</span>${interestChips(me.interests)}</div>` : ''}
      <button class="btn btn-primary" type="submit">Сохранить</button>
    </form>
    <div class="sheet" id="tg">
      <div class="tg">
        <span class="tg-icon">${icon.tg}</span>
        <div>
          <h2 style="margin-bottom:4px">Telegram</h2>
          ${
            tg.linked
              ? `<p class="small" style="margin:0 0 4px"><span class="tag tag-green">Аккаунт подтверждён</span></p>
                 <p class="small muted">Подключён ${tg.username ? '@' + esc(tg.username) : ''}. Уведомления о начислениях и проверках приходят в Telegram. Команды бота: /balance, /history, /tasks.</p>
                 <button class="btn btn-ghost btn-sm" id="tg-unlink">Отключить</button>`
              : `<p class="small muted">Подключите бота: уведомления о начислениях будут приходить сразу, а аккаунт станет подтверждённым. Один Telegram можно привязать только к одному аккаунту.</p>
                 <button class="btn btn-primary" id="tg-link">Подключить Telegram</button>
                 <div id="tg-code"></div>`
          }
        </div>
      </div>
    </div>
  </div>`;
  $('#logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    state.me = null;
    stopPolling();
    location.hash = '#/';
  });
  bindForm($('#f'), async (d) => {
    const { user } = await api('/api/me', { method: 'PUT', body: { name: d.name, interests: d.interests } });
    state.me = user;
    renderChrome();
    toast('Профиль сохранён');
  });
  $('#tg-unlink')?.addEventListener('click', async () => {
    await api('/api/telegram/unlink', { method: 'POST', body: {} });
    toast('Telegram отключён');
    viewProfile();
  });
  $('#tg-link')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const c = await api('/api/telegram/link-code', { method: 'POST', body: {} });
    $('#tg-code').innerHTML = `
      <hr>
      ${!c.enabled ? '<p class="form-error">Бот не настроен на сервере: укажите TELEGRAM_BOT_TOKEN в файле .env и перезапустите сервер.</p>' : ''}
      <p class="small">${c.deepLink ? 'Нажмите кнопку — бот откроется с вашим кодом. Или отправьте боту команду:' : 'Отправьте боту команду:'}</p>
      <div class="tg-code">/start ${esc(c.code)}</div>
      <p class="small muted" style="margin-top:8px">Код действует 15 минут. Страница обновится сама, когда бот подтвердит аккаунт.</p>
      ${c.deepLink ? `<a class="btn btn-primary" href="${esc(c.deepLink)}" target="_blank" rel="noopener">Открыть @${esc(c.botUsername)}</a>` : ''}`;
    state.tgPoll = setInterval(async () => {
      const u = await refreshMe().catch(() => null);
      if (u?.telegram.linked) {
        clearInterval(state.tgPoll);
        renderChrome();
        toast('Telegram подключён, аккаунт подтверждён', { stamp: 'ПОДТВЕРЖДЕНО' });
        viewProfile();
      }
    }, 3000);
  });
}

async function viewNotifications() {
  const { notifications } = await api('/api/notifications');
  await api('/api/notifications/read', { method: 'POST', body: {} });
  state.unread = 0;
  state.lastSeenNotif = Math.max(state.lastSeenNotif, ...notifications.map((n) => n.id), 0);
  renderChrome();
  app.innerHTML = `
  <div class="page-head"><div><h1>Уведомления</h1></div></div>
  ${
    notifications.length
      ? `<div class="sheet"><ul class="notes-list">${notifications
          .map(
            (n) => `<li class="${n.read_at ? '' : 'unread'}"><span class="mark"></span>
          <div><b>${esc(n.title)}</b><div class="small">${esc(n.body)}</div>${n.link ? `<a class="small" href="${esc(n.link.replace(/^\//, ''))}">Открыть</a>` : ''}</div>
          <span class="small muted">${fmtDate(n.created_at)}</span></li>`
          )
          .join('')}</ul></div>`
      : '<div class="empty"><p>Уведомлений пока нет.</p></div>'
  }`;
}

// ===================================================================
//                         КАБИНЕТ КОМПАНИИ
// ===================================================================
const campStatus = (s) =>
  ({ active: '<span class="tag tag-green">Активна</span>', paused: '<span class="tag tag-amber">Пауза</span>', closed: '<span class="tag">Закрыта</span>' })[s];

async function viewCompany() {
  const o = await api('/api/company/overview');
  state.me.balance = o.balance;
  renderChrome();
  const kzt = state.meta.economy.abToKzt;
  app.innerHTML = `
  <div class="page-head">
    <div><h1>${esc(state.me.companyName)}</h1><p class="muted">Вы платите только за подтверждённые результаты.</p></div>
    <a class="btn btn-primary" href="#/company/new">Создать кампанию</a>
  </div>
  <div class="kpis">
    <div><b>${fmt(o.balance)} AB</b><span>Свободный бюджет, ≈ ${fmt(o.balance * kzt)} ₸</span></div>
    <div><b>${fmt(o.totals.results)}</b><span>Подтверждённых результатов</span></div>
    <div><b>${fmt(o.totals.pending)}</b><span>Ждут вашей проверки</span></div>
    <div><b>${fmt(o.totals.spent)} AB</b><span>Потрачено, в резерве ${fmt(o.totals.reserved)}</span></div>
  </div>

  <div class="sheet" style="margin-top:16px">
    <h2>Кампании</h2>
    ${
      o.campaigns.length
        ? `<table class="table"><thead><tr><th>Кампания</th><th class="hide-sm">Статус</th><th>Результаты</th><th class="hide-sm">Проверка</th><th class="hide-sm" style="text-align:right">Потрачено</th></tr></thead><tbody>
      ${o.campaigns
        .map(
          (c) => `<tr>
          <td><a class="rowlink" href="#/company/campaigns/${c.id}">${esc(c.title)}</a><div class="small muted">${esc(c.categoryLabel)} · +${c.reward} AB за результат</div></td>
          <td class="hide-sm">${campStatus(c.status)}</td>
          <td class="num">${c.stats.approved} / ${c.maxParticipants}<div class="meter"><i style="width:${Math.min(100, (c.stats.approved / c.maxParticipants) * 100)}%"></i></div></td>
          <td class="hide-sm">${c.stats.pending ? `<a class="tag tag-amber" href="#/company/campaigns/${c.id}">${c.stats.pending} на проверке</a>` : '<span class="muted small">—</span>'}</td>
          <td class="hide-sm num" style="text-align:right">${fmt(c.stats.spent)} AB</td></tr>`
        )
        .join('')}</tbody></table>`
        : `<div class="empty"><p>Создайте первую кампанию: плейтест, отзыв об игре или UX-исследование.</p><a class="btn btn-primary" href="#/company/new">Создать кампанию</a></div>`
    }
  </div>

  <form class="sheet row" id="dep" style="margin-top:16px;align-items:end">
    <label class="field" style="flex:1;min-width:200px"><span>Пополнить бюджет (демо, без оплаты)</span><input class="input" name="amount" type="number" min="100" step="100" value="5000"></label>
    <button class="btn btn-ghost" type="submit">Пополнить</button>
  </form>`;
  bindForm($('#dep'), async (d) => {
    const r = await api('/api/company/deposit', { method: 'POST', body: { amount: Number(d.amount) } });
    toast(`Бюджет пополнен. Баланс: ${fmt(r.balance)} AB`);
    viewCompany();
  });
}

async function viewNewCampaign() {
  const { meta } = state;
  const fee = meta.economy.platformFeePercent;
  app.innerHTML = `
  <p><a href="#/company">Кампании</a></p>
  <h1>Новая кампания</h1>
  <div class="split">
    <form class="stack" id="f" novalidate>
      <div class="sheet stack">
        <h2>О задании</h2>
        <label class="field" data-q="title"><span>Название</span><input class="input" name="title" placeholder="Плейтест: первые 15 минут игры" required></label>
        <label class="field"><span>Описание и инструкция для участника</span><textarea class="input" name="description" placeholder="Что установить, что пройти, на что обратить внимание" required></textarea></label>
        <div class="grid grid-2">
          <label class="field"><span>Категория</span><select class="input" name="category">${meta.categories.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Ссылка на продукт</span><input class="input" name="productUrl" type="url" placeholder="https://"></label>
        </div>
        <div class="field"><span>Кому показывать</span>${interestChips([], 'audience')}<small>Не выбрано — задание видят все участники.</small></div>
      </div>
      <div class="sheet stack">
        <h2>Награда и проверка</h2>
        <div class="grid grid-3">
          <label class="field"><span>Награда, AB</span><input class="input" name="reward" type="number" min="5" value="50"></label>
          <label class="field"><span>Участников</span><input class="input" name="maxParticipants" type="number" min="1" value="20"></label>
          <label class="field"><span>Мин. время, сек</span><input class="input" name="minSeconds" type="number" min="0" value="120"><small>Быстрее — ниже оценка</small></label>
        </div>
        <label class="check"><input type="checkbox" name="autoApprove"> Одобрять автоматически, если оценка качества от ${meta.verification.autoApproveScore}/100</label>
        <label class="check"><input type="checkbox" name="requireTelegram"> Только для участников, подтверждённых через Telegram</label>
      </div>
      <div class="sheet">
        <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Вопросы</h2><span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" data-add="rating">Оценка 1–5</button>
          <button type="button" class="btn btn-ghost btn-sm" data-add="text">Текст</button>
          <button type="button" class="btn btn-ghost btn-sm" data-add="choice">Выбор</button>
        </div>
        <div id="qs"></div>
      </div>
    </form>
    <aside class="budget" aria-live="polite">
      <h3>Бюджет кампании</h3>
      <dl id="budget"></dl>
      <p>Бюджет резервируется при публикации. Награда и комиссия ${fee}% списываются только за одобренные результаты. При закрытии кампании остаток возвращается. Проценты — иллюстративная модель MVP.</p>
      <button class="btn btn-primary btn-block" style="margin-top:16px" type="submit" form="f">Опубликовать</button>
    </aside>
  </div>`;

  const qs = $('#qs');
  const typeName = { rating: 'Оценка 1–5', text: 'Текстовый ответ', choice: 'Выбор варианта' };
  const addQ = (type, label = '', extra = {}) => {
    const el = document.createElement('div');
    el.className = 'qbuilder';
    el.dataset.type = type;
    el.innerHTML = `
      <div class="qrow">
        <span class="tag tag-blue" style="justify-self:start;margin-top:10px">${typeName[type]}</span>
        <input class="input" data-k="label" placeholder="Текст вопроса" value="${esc(label)}">
        <button type="button" class="btn btn-ghost btn-sm" data-del aria-label="Удалить вопрос" style="margin-top:4px">Удалить</button>
      </div>
      ${type === 'choice' ? `<label class="field" style="margin-top:10px"><span>Варианты, по одному в строке</span><textarea class="input" data-k="options" style="min-height:80px">${esc((extra.options || []).join('\n'))}</textarea></label>` : ''}
      ${type === 'text' ? `<label class="field" style="margin-top:10px;max-width:220px"><span>Мин. длина ответа</span><input class="input" type="number" data-k="minLength" value="${extra.minLength ?? 30}"></label>` : ''}`;
    $('[data-del]', el).addEventListener('click', () => el.remove());
    qs.append(el);
  };
  addQ('rating', 'Насколько интересно было играть?');
  addQ('text', 'Где вы запутались или захотели выйти? Опишите подробно.', { minLength: 40 });
  addQ('choice', 'Продолжите пользоваться после теста?', { options: ['Да', 'Возможно', 'Нет'] });
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addQ(b.dataset.add)));

  const form = $('#f');
  const calc = () => {
    const reward = Math.max(0, Number(form.reward.value) || 0);
    const n = Math.max(0, Number(form.maxParticipants.value) || 0);
    const f = Math.ceil((reward * fee) / 100);
    const total = (reward + f) * n;
    const enough = total <= state.me.balance;
    $('#budget').innerHTML = `
      <dt>Награда участнику</dt><dd>${fmt(reward)} AB</dd>
      <dt>Комиссия платформы</dt><dd>${fmt(f)} AB</dd>
      <dt>Цена одного результата</dt><dd>${fmt(reward + f)} AB</dd>
      <dt>× участников</dt><dd>${fmt(n)}</dd>
      <dt class="total">Резерв</dt><dd class="total">${fmt(total)} AB</dd>
      <dt>≈ в тенге</dt><dd>${fmt(total * state.meta.economy.abToKzt)} ₸</dd>
      <dt>Доступно</dt><dd style="color:${enough ? '#9ff0c3' : '#ffb4a8'}">${fmt(state.me.balance)} AB</dd>`;
  };
  form.addEventListener('input', calc);
  calc();

  bindForm(form, async (d) => {
    const questions = $$('.qbuilder', qs).map((el) => {
      const q = { type: el.dataset.type, label: $('[data-k=label]', el).value };
      if (q.type === 'choice') q.options = $('[data-k=options]', el).value.split('\n');
      if (q.type === 'text') q.minLength = Number($('[data-k=minLength]', el).value);
      return q;
    });
    const body = {
      ...d,
      reward: Number(d.reward),
      maxParticipants: Number(d.maxParticipants),
      minSeconds: Number(d.minSeconds),
      audience: d.audience || [],
      questions,
    };
    const { campaign } = await api('/api/company/campaigns', { method: 'POST', body });
    await refreshMe();
    toast('Кампания опубликована. Участники уже видят задание.');
    location.hash = `#/company/campaigns/${campaign.id}`;
  });
}

const scoreClass = (s) => (s >= 70 ? 'hi' : s >= 30 ? 'mid' : 'lo');
const trustLabel = { new: ['Новый', ''], regular: ['Обычный', 'tag-blue'], trusted: ['Надёжный', 'tag-green'], risky: ['Под вопросом', 'tag-red'] };

function answerList(questions, answers) {
  return `<dl class="answer" style="display:grid;gap:10px;margin:0">${questions
    .map((q) => `<div><dt>${esc(q.label)}</dt><dd>${answers?.[q.id] !== undefined ? (q.type === 'rating' ? `<b>${answers[q.id]}</b> из 5` : esc(answers[q.id])) : '<span class="muted">—</span>'}</dd></div>`)
    .join('')}</dl>`;
}

async function viewCampaign({ params, query }) {
  const data = await api(`/api/company/campaigns/${params.id}`);
  const c = data.campaign;
  const pending = data.submissions.filter((s) => s.status === 'submitted');
  const tab = query.tab || (pending.length ? 'review' : 'results');

  const sub = (s, actions) => `
    <article class="review">
      <div class="review-head">
        <b>${esc(s.participant.name)}</b>
        ${s.participant.verified ? '<span class="tag tag-green">Telegram подтверждён</span>' : '<span class="tag">Без Telegram</span>'}
        <span class="tag ${trustLabel[s.participant.trust.level][1]}" title="Одобрено ${s.participant.trust.approved}, отклонено ${s.participant.trust.rejected}">Репутация: ${trustLabel[s.participant.trust.level][0]}</span>
        <span class="spacer"></span>
        <span class="small muted">Качество</span> <span class="score ${scoreClass(s.autoScore)}">${s.autoScore}/100</span>
        ${actions ? '' : statusTag(s.status)}
      </div>
      <div class="review-body">
        ${s.flags.length ? `<div class="flags">${s.flags.map((f) => `<span class="tag tag-amber">${esc(f.label)}</span>`).join('')}</div>` : ''}
        ${answerList(c.questions, s.answers)}
        <div class="small muted">Отправлено ${fmtDate(s.submittedAt)}${s.reviewNote ? ` · ${esc(s.reviewNote)}` : ''}${s.reviewedBy === 'auto' ? ' · решение автопроверки' : ''}</div>
      </div>
      ${
        actions
          ? `<form class="review-actions" data-review="${s.id}">
        <label class="field"><span class="small">Оценка</span><select class="input" name="rating"><option value="">—</option>${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label class="field"><span class="small">Комментарий участнику</span><input class="input" name="note" placeholder="Обязателен при отклонении"></label>
        <button class="btn btn-ok" type="submit" name="decision" value="approve">Одобрить, +${c.reward} AB</button>
        <button class="btn btn-danger" type="submit" name="decision" value="reject">Отклонить</button>
      </form>`
          : ''
      }
    </article>`;

  const results = data.results
    .map((q) => {
      if (q.type === 'rating') {
        const max = Math.max(1, ...q.dist);
        return `<div class="sheet"><h3>${esc(q.label)}</h3><p class="muted small">Средняя: <b style="color:var(--ink);font-size:1.2rem">${q.avg ?? '—'}</b> из 5 · ответов ${q.count}</p>
          <div class="bars">${q.dist.map((n, i) => `<div class="bar"><span>${i + 1}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span class="n">${n}</span></div>`).join('')}</div></div>`;
      }
      if (q.type === 'choice') {
        const max = Math.max(1, ...q.dist.map((d) => d.n));
        return `<div class="sheet"><h3>${esc(q.label)}</h3><div class="bars">${q.dist.map((d) => `<div class="bar"><span>${esc(d.option)}</span><div class="track"><div class="fill" style="width:${(d.n / max) * 100}%"></div></div><span class="n">${d.n}</span></div>`).join('')}</div></div>`;
      }
      return `<div class="sheet"><h3>${esc(q.label)}</h3>${q.samples.length ? q.samples.map((s) => `<blockquote class="quote">${esc(s)}</blockquote>`).join('') : '<p class="muted small">Пока нет одобренных ответов.</p>'}</div>`;
    })
    .join('');

  app.innerHTML = `
  <p><a href="#/company">Кампании</a></p>
  <div class="page-head">
    <div><div class="task-meta">${campStatus(c.status)}<span class="tag">${esc(c.categoryLabel)}</span><span>+${c.reward} AB за результат, комиссия ${c.feePerResult} AB</span></div>
      <h1 style="margin-top:10px">${esc(c.title)}</h1></div>
    <div class="row">
      ${c.status === 'active' ? '<button class="btn btn-ghost" data-status="paused">Пауза</button>' : ''}
      ${c.status === 'paused' ? '<button class="btn btn-ghost" data-status="active">Возобновить</button>' : ''}
      ${c.status !== 'closed' ? '<button class="btn btn-danger" data-status="closed">Закрыть и вернуть остаток</button>' : ''}
      <a class="btn btn-ghost" href="/api/company/campaigns/${c.id}/export.csv" download>Экспорт CSV</a>
    </div>
  </div>
  <div class="kpis" style="margin-bottom:20px">
    <div><b>${c.stats.approved} / ${c.maxParticipants}</b><span>Подтверждённых результатов</span></div>
    <div><b>${c.stats.pending}</b><span>Ждут проверки</span></div>
    <div><b>${c.stats.avgScore ?? '—'}</b><span>Среднее качество, из 100</span></div>
    <div><b>${fmt(c.stats.spent)} AB</b><span>Потрачено, в резерве ${fmt(c.stats.reserved)}</span></div>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" data-tab="review" aria-selected="${tab === 'review'}">На проверке (${pending.length})</button>
    <button role="tab" data-tab="results" aria-selected="${tab === 'results'}">Результаты</button>
    <button role="tab" data-tab="all" aria-selected="${tab === 'all'}">Все ответы (${data.submissions.length})</button>
  </div>
  <div id="tab">${
    tab === 'review'
      ? pending.length
        ? pending.map((s) => sub(s, true)).join('')
        : '<div class="empty"><p>Очередь пуста. Новые результаты появятся здесь, а уведомление придёт в Telegram.</p></div>'
      : tab === 'results'
        ? `<div class="grid grid-2" style="align-items:start">${results}</div>`
        : data.submissions.length
          ? data.submissions.map((s) => sub(s, false)).join('')
          : '<div class="empty"><p>Пока никто не отправил результат.</p></div>'
  }</div>`;

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => (location.hash = `#/company/campaigns/${c.id}?tab=${b.dataset.tab}`)));
  $$('[data-status]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.status === 'closed' && !b.dataset.confirm) {
        b.dataset.confirm = '1';
        b.textContent = 'Точно закрыть?';
        return;
      }
      try {
        await api(`/api/company/campaigns/${c.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
        await refreshMe();
        toast(b.dataset.status === 'closed' ? 'Кампания закрыта, остаток бюджета возвращён' : 'Статус обновлён');
        viewCampaign({ params, query });
      } catch (e) {
        toast(e.message, { kind: 'err' });
      }
    })
  );
  $$('[data-review]').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const decision = e.submitter?.value;
      const d = formData(form);
      $$('button', form).forEach((b) => (b.disabled = true));
      try {
        await api(`/api/company/submissions/${form.dataset.review}/review`, { method: 'POST', body: { decision, rating: d.rating || null, note: d.note } });
        toast(decision === 'approve' ? `Одобрено. Участнику начислено +${c.reward} AB` : 'Ответ отклонён, место освобождено', decision === 'approve' ? { stamp: 'ОДОБРЕНО' } : {});
        await refreshMe();
        renderChrome();
        viewCampaign({ params, query: { tab: 'review' } });
      } catch (err) {
        showFormError(form, err);
        $$('button', form).forEach((b) => (b.disabled = false));
      }
    })
  );
}

async function viewCompanyRewards() {
  const { rewards } = await api('/api/company/rewards');
  app.innerHTML = `
  <div class="page-head"><div><h1>Награды для участников</h1><p class="muted">Ключи раннего доступа, внутриигровые предметы, подписки. Так AB Points получают реальную ценность, а вы — вовлечённых игроков.</p></div></div>
  <div class="split">
    <div class="stack">${
      rewards.length
        ? `<div class="rewards">${rewards
            .map(
              (r) => `<div class="ticket"><h3 style="margin:0">${esc(r.title)}</h3><p class="small" style="margin:0">${esc(r.description)}</p>
          <div class="foot"><span class="cost">${fmt(r.cost)} AB</span><span class="small muted">выдано ${r.redeemed}, осталось ${r.stock}</span></div></div>`
            )
            .join('')}</div>`
        : '<div class="empty"><p>Добавьте первую награду, на которую участники смогут обменять AB Points.</p></div>'
    }</div>
    <form class="sheet stack" id="f">
      <h2>Новая награда</h2>
      <label class="field"><span>Название</span><input class="input" name="title" placeholder="Ключ раннего доступа"></label>
      <label class="field"><span>Описание</span><textarea class="input" name="description" style="min-height:80px"></textarea></label>
      <div class="grid grid-2">
        <label class="field"><span>Цена, AB</span><input class="input" type="number" name="cost" value="100"></label>
        <label class="field"><span>Количество</span><input class="input" type="number" name="stock" value="50"></label>
      </div>
      <button class="btn btn-primary" type="submit">Добавить награду</button>
    </form>
  </div>`;
  bindForm($('#f'), async (d) => {
    await api('/api/company/rewards', { method: 'POST', body: { ...d, cost: Number(d.cost), stock: Number(d.stock) } });
    toast('Награда добавлена');
    viewCompanyRewards();
  });
}

// ---------- Запуск ----------
async function boot() {
  try {
    state.meta = await api('/api/meta');
    await refreshMe();
  } catch {
    app.innerHTML = '<div class="empty"><p>Сервер недоступен. Проверьте подключение и обновите страницу.</p></div>';
    return;
  }
  if (state.me) startPolling();
  window.addEventListener('hashchange', router);
  router();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
