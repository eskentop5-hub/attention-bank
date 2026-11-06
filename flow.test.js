// Сквозной тест главного Demo Flow + безопасность + Telegram (с подменой Bot API).
// Запуск: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_BOT_USERNAME = 'attention_test_bot';
process.env.TELEGRAM_GROUP_ID = '-100777';
process.env.PLATFORM_FEE_PERCENT = '20';

const sent = [];
const { setTransport } = await import('../server/telegram/api.js');
setTransport(async (method, payload) => {
  sent.push({ method, ...payload });
  return { message_id: sent.length };
});
const { createServer } = await import('../server/app.js');
const { handleUpdate } = await import('../server/telegram/bot.js');
const { db, run } = await import('../server/db.js');
const { verifyAllLedgers } = await import('../server/services/ledger.js');

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
  };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

const company = client();
const user = client();
const user2 = client();
let campaignId, rewardId;

test('регистрация компании и участника', async () => {
  let r = await company('POST', '/api/auth/register', { role: 'company', email: 'c@test.kz', password: 'password1', name: 'Данияр', companyName: 'Test Studio', consent: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'company');

  r = await user('POST', '/api/auth/register', { email: 'u@test.kz', password: 'password1', name: 'Айгерим', consent: true });
  assert.equal(r.status, 400, 'без подтверждения возраста регистрация запрещена');

  r = await user('POST', '/api/auth/register', { email: 'u@test.kz', password: 'password1', name: 'Айгерим', consent: true, ageConfirmed: true });
  assert.equal(r.status, 200);
  r = await user2('POST', '/api/auth/register', { email: 'u2@test.kz', password: 'password1', name: 'Арман', consent: true, ageConfirmed: true });
  assert.equal(r.status, 200);

  r = await user('PUT', '/api/me', { interests: ['mobile_games', 'unknown_interest'], balance: 999999, role: 'company' });
  assert.deepEqual(r.data.user.interests, ['mobile_games']);
  assert.equal(r.data.user.balance, 0, 'клиент не может изменить баланс');
  assert.equal(r.data.user.role, 'user', 'клиент не может изменить роль');
});

test('кампания: без бюджета нельзя, после пополнения — резерв', async () => {
  const body = {
    title: 'Плейтест мобильной игры',
    description: 'Пройдите первые три уровня и расскажите, что было непонятно.',
    category: 'game_testing',
    audience: ['mobile_games'],
    reward: 50,
    maxParticipants: 2,
    minSeconds: 0,
    questions: [
      { type: 'rating', label: 'Насколько интересно?' },
      { type: 'text', label: 'Что было непонятно?', minLength: 20 },
      { type: 'choice', label: 'Продолжите играть?', options: ['Да', 'Нет'] },
    ],
  };
  let r = await company('POST', '/api/company/campaigns', body);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Недостаточно/);

  r = await company('POST', '/api/company/deposit', { amount: 1000 });
  assert.equal(r.data.balance, 1000);

  r = await company('POST', '/api/company/campaigns', body);
  assert.equal(r.status, 200);
  campaignId = r.data.campaign.id;
  // (50 + 20% = 60) × 2 = 120
  r = await company('GET', '/api/company/overview');
  assert.equal(r.data.balance, 880);
  assert.equal(r.data.campaigns[0].stats.reserved, 120);

  await tick();
  assert.ok(sent.some((m) => m.method === 'sendMessage' && m.chat_id === '-100777' && /Новое задание/.test(m.text)), 'пост в Telegram-группу');

  r = await user('POST', '/api/company/campaigns', body);
  assert.equal(r.status, 403, 'участник не может создавать кампании');
});

test('участник видит задание, выполняет, автопроверка валидирует', async () => {
  let r = await user('GET', '/api/tasks');
  const t = r.data.tasks.find((x) => x.id === campaignId);
  assert.ok(t && t.matches);

  r = await user('POST', `/api/tasks/${campaignId}/submit`, { answers: {} });
  assert.equal(r.status, 400, 'нельзя отправить без старта');

  r = await user('POST', `/api/tasks/${campaignId}/start`, {});
  assert.equal(r.data.task.my.status, 'started');

  r = await user('POST', `/api/tasks/${campaignId}/submit`, { answers: { q1: 7, q2: 'коротко', q3: 'Может быть' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.q1 && r.data.details.q2 && r.data.details.q3, 'ошибки по каждому вопросу');

  r = await user('POST', `/api/tasks/${campaignId}/submit`, {
    answers: { q1: 4, q2: 'На втором уровне неясно, как прыгать через яму.', q3: 'Да' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.outcome, 'pending');
  assert.ok(r.data.flags.includes('unverified_account'));

  r = await user('POST', `/api/tasks/${campaignId}/submit`, { answers: { q1: 4, q2: 'Повторная отправка ответа', q3: 'Да' } });
  assert.equal(r.status, 400, 'повторная отправка запрещена');
});

test('дубликат текста от второго участника получает флаг', async () => {
  await user2('PUT', '/api/me', { interests: ['mobile_games'] });
  await user2('POST', `/api/tasks/${campaignId}/start`, {});
  const r = await user2('POST', `/api/tasks/${campaignId}/submit`, {
    answers: { q1: 4, q2: 'На втором уровне неясно, как прыгать через яму.', q3: 'Да' },
  });
  assert.ok(r.data.flags.includes('duplicate_text'));
});

test('Telegram: привязка по коду, бонус, 1 Telegram = 1 аккаунт', async () => {
  const { data: code } = await user('POST', '/api/telegram/link-code', {});
  assert.match(code.deepLink, /^https:\/\/t\.me\/attention_test_bot\?start=/);

  await handleUpdate({ message: { chat: { id: 555, type: 'private' }, from: { username: 'aigerim' }, text: `/start ${code.code}` } });
  let r = await user('GET', '/api/me');
  assert.equal(r.data.user.telegram.linked, true);
  assert.equal(r.data.user.balance, 10, 'бонус за подтверждение');
  assert.ok(sent.some((m) => m.chat_id === 555 && /Аккаунт подтверждён/.test(m.text)));

  // Повторное использование кода
  await handleUpdate({ message: { chat: { id: 556, type: 'private' }, text: `/start ${code.code}` } });
  assert.ok(sent.some((m) => m.chat_id === 556 && /уже использован/.test(m.text)));

  // Тот же Telegram на другой аккаунт
  const { data: code2 } = await user2('POST', '/api/telegram/link-code', {});
  await handleUpdate({ message: { chat: { id: 555, type: 'private' }, text: `/start ${code2.code}` } });
  r = await user2('GET', '/api/me');
  assert.equal(r.data.user.telegram.linked, false);
  assert.ok(sent.some((m) => m.chat_id === 555 && /другому аккаунту/.test(m.text)));

  await handleUpdate({ message: { chat: { id: 555, type: 'private' }, text: '/balance' } });
  assert.ok(sent.some((m) => m.chat_id === 555 && /10 AB Points/.test(m.text)));
});

test('компания одобряет → транзакция → уведомление в Telegram', async () => {
  let r = await company('GET', `/api/company/campaigns/${campaignId}`);
  const sub = r.data.submissions.find((s) => s.participant.name === 'Айгерим');
  const sub2 = r.data.submissions.find((s) => s.participant.name === 'Арман');

  r = await user('POST', `/api/company/submissions/${sub.id}/review`, { decision: 'approve' });
  assert.equal(r.status, 403, 'участник не может одобрять');

  sent.length = 0;
  r = await company('POST', `/api/company/submissions/${sub.id}/review`, { decision: 'approve', rating: 5 });
  assert.equal(r.status, 200);
  await tick();
  const msg = sent.find((m) => m.chat_id === '555');
  assert.ok(msg, 'уведомление ушло в Telegram');
  assert.match(msg.text, /\+50 AB Points/);
  assert.match(msg.text, /New balance: <b>60 AB<\/b>/);

  r = await company('POST', `/api/company/submissions/${sub.id}/review`, { decision: 'approve' });
  assert.equal(r.status, 400, 'двойное одобрение невозможно');

  r = await company('POST', `/api/company/submissions/${sub2.id}/review`, { decision: 'reject' });
  assert.equal(r.status, 400, 'отклонение без комментария запрещено');
  r = await company('POST', `/api/company/submissions/${sub2.id}/review`, { decision: 'reject', note: 'Скопированный ответ' });
  assert.equal(r.status, 200);

  r = await user('GET', '/api/wallet');
  assert.equal(r.data.balance, 60);
  assert.deepEqual(r.data.transactions.map((t) => t.amount), [50, 10]);
  assert.equal(r.data.integrity.ok, true);
});

test('магазин наград: списание транзакцией, нельзя уйти в минус', async () => {
  let r = await company('POST', '/api/company/rewards', { title: 'Ключ раннего доступа', description: 'Игра до релиза', cost: 40, stock: 1 });
  rewardId = r.data.reward.id;
  r = await user('POST', `/api/rewards/${rewardId}/redeem`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.balance, 20);
  assert.match(r.data.code, /^AB-/);
  r = await user('POST', `/api/rewards/${rewardId}/redeem`, {});
  assert.equal(r.status, 400, 'награда закончилась');

  r = await company('POST', '/api/company/rewards', { title: 'Дорогая награда', description: 'Тест минуса', cost: 1000, stock: 5 });
  r = await user('POST', `/api/rewards/${r.data.reward.id}/redeem`, {});
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Недостаточно/);
  r = await user('GET', '/api/wallet');
  assert.equal(r.data.balance, 20);
});

test('закрытие кампании возвращает неиспользованный бюджет', async () => {
  let r = await company('POST', `/api/company/campaigns/${campaignId}/status`, { status: 'closed' });
  assert.equal(r.status, 200);
  r = await company('GET', '/api/company/overview');
  // 1000 − 120 резерв + 60 возврат (одно место не использовано)
  assert.equal(r.data.balance, 940);
  r = await company('GET', `/api/company/campaigns/${campaignId}/export.csv`);
  assert.match(r.data, /submission_id/);
});

test('безопасность: CSRF, чужие данные, целостность журнала', async () => {
  let r = await fetch(base + '/api/auth/login', { method: 'POST', body: 'email=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415, 'формы с чужих сайтов не принимаются');
  r = await fetch(base + '/api/company/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: '{"amount":1000}',
  });
  assert.equal(r.status, 403);
  r = await fetch(base + '/api/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403, 'webhook без секрета отклоняется');

  // Даже прямое изменение кэша баланса в БД будет обнаружено сверкой с журналом
  assert.equal(verifyAllLedgers().ok, true);
  run("UPDATE users SET balance = balance + 1000 WHERE email = 'u@test.kz'");
  assert.equal(verifyAllLedgers().ok, false);
  run("UPDATE users SET balance = balance - 1000 WHERE email = 'u@test.kz'");
  assert.equal(verifyAllLedgers().ok, true);

  const bad = await user('POST', '/api/auth/login', { email: 'u@test.kz', password: 'wrong' });
  assert.equal(bad.status, 400);
});
