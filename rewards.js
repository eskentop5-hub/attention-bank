// Магазин наград: на что тратятся AB Points.
// Награды добавляют сами компании (ключи раннего доступа, внутриигровые бонусы, скидки) —
// поэтому у баллов есть реальная ценность в выбранной нише.
import { one, all, run, tx } from '../db.js';
import { bad, notFound, str, int, randomCode } from '../util.js';
import { postTransaction } from './ledger.js';
import { notify } from './notifications.js';

const view = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  cost: r.cost,
  stock: r.stock,
  active: !!r.active,
  company: r.company_name || 'ATTENTION BANK',
});

export const listRewards = () =>
  all(
    `SELECT r.*, u.company_name FROM rewards r LEFT JOIN users u ON u.id = r.company_id
     WHERE r.active = 1 ORDER BY r.cost ASC`
  ).map(view);

export const companyRewards = (companyId) =>
  all(
    `SELECT r.*, u.company_name, (SELECT COUNT(*) FROM redemptions x WHERE x.reward_id = r.id) AS redeemed
     FROM rewards r LEFT JOIN users u ON u.id = r.company_id WHERE r.company_id = ? ORDER BY r.id DESC`,
    companyId
  ).map((r) => ({ ...view(r), redeemed: r.redeemed }));

export function createReward(company, body) {
  const title = str(body.title, { field: 'Название награды', min: 3, max: 100 });
  const description = str(body.description, { field: 'Описание', min: 5, max: 500 });
  const cost = int(body.cost, { field: 'Цена в AB', min: 1, max: 100000 });
  const stock = int(body.stock, { field: 'Количество', min: 1, max: 100000 });
  const r = run('INSERT INTO rewards (company_id, title, description, cost, stock) VALUES (?, ?, ?, ?, ?)', company.id, title, description, cost, stock);
  return one('SELECT * FROM rewards WHERE id = ?', Number(r.lastInsertRowid));
}

export function redeem(user, rewardId) {
  return tx(() => {
    const r = one('SELECT * FROM rewards WHERE id = ? AND active = 1', rewardId);
    if (!r) throw notFound('Награда не найдена');
    if (r.stock <= 0) throw bad('Эта награда закончилась');
    const code = `AB-${randomCode(4)}-${randomCode(4)}`;
    run('UPDATE rewards SET stock = stock - 1 WHERE id = ?', r.id);
    const red = run('INSERT INTO redemptions (reward_id, user_id, code, cost) VALUES (?, ?, ?, ?)', r.id, user.id, code, r.cost);
    const { balanceAfter } = postTransaction({
      userId: user.id,
      amount: -r.cost,
      type: 'redemption',
      title: `Награда: ${r.title}`,
      refType: 'redemption',
      refId: Number(red.lastInsertRowid),
    });
    notify(user.id, {
      kind: 'redemption',
      title: `Награда получена: ${r.title}`,
      body: `Ваш код: ${code}. Списано ${r.cost} AB, баланс: ${balanceAfter} AB`,
      link: '/#/rewards',
      telegram: `🎁 <b>Награда получена</b>\n${r.title}\nКод: <code>${code}</code>\n−${r.cost} AB · баланс ${balanceAfter} AB`,
    });
    return { code, balance: balanceAfter };
  });
}

export const myRedemptions = (userId) =>
  all(
    `SELECT x.id, x.code, x.cost, x.created_at, r.title, r.description FROM redemptions x JOIN rewards r ON r.id = x.reward_id
     WHERE x.user_id = ? ORDER BY x.id DESC`,
    userId
  );
