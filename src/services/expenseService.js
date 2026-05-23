const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const pushService    = require('./pushService');

async function listByConnection(connectionId, filters = {}, userId) {
  let sql    = 'SELECT * FROM expenses WHERE connection_id = ? AND deleted_at IS NULL';
  const params = [connectionId];
  if (filters.status && filters.status !== 'all') { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.childId)  { sql += ' AND child_id = ?';    params.push(filters.childId); }
  if (filters.month)    { sql += ' AND DATE_FORMAT(expense_date, "%Y-%m") = ?'; params.push(filters.month); }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const [expenses] = await db.query(sql, params);
  const [countRow] = await db.query('SELECT COUNT(*) as total FROM expenses WHERE connection_id = ? AND deleted_at IS NULL', [connectionId]);
  return { expenses: expenses.map(e => ({ ...e, myShare: calculateShare(e.amount, e.split_ratio).mine })), total: countRow[0].total };
}

async function findById(expenseId, connectionId) {
  const [rows] = await db.query('SELECT * FROM expenses WHERE id = ? AND connection_id = ? AND deleted_at IS NULL', [expenseId, connectionId]);
  return rows[0] || null;
}

async function create(connectionId, submittedBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO expenses (id, connection_id, child_id, submitted_by_id, title, description, category, amount, split_ratio, expense_date, receipt_minio_key, receipt_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, connectionId, data.childId || data.child_id, submittedBy, data.title, data.description || null, data.category, data.amount, data.splitRatio || data.split_ratio || '50/50', data.expenseDate || data.expense_date, data.receiptKey || null, data.receiptName || null]
  );
  const expense = await findById(id, connectionId);
  // Notifica co-parente (fire-and-forget)
  pushService.notifyNewExpense(submittedBy, connectionId, {
    id, title: data.title, amount: data.amount,
  }).catch((err) => console.error('[Push] notifyNewExpense error:', err.message));
  return expense;
}

async function update(expenseId, userId, data) {
  const allowed = ['title', 'description', 'category', 'amount', 'split_ratio', 'expense_date'];
  const mapped  = { splitRatio: 'split_ratio', expenseDate: 'expense_date' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE expenses SET ${sets} WHERE id = ? AND submitted_by_id = ? AND status = 'pending'`, [...fields.map(([, v]) => v), expenseId, userId]);
}

async function softDelete(expenseId, userId) {
  await db.query(`UPDATE expenses SET deleted_at = NOW() WHERE id = ? AND submitted_by_id = ? AND status = 'pending'`, [expenseId, userId]);
}

async function setStatus(expenseId, userId, status, reason) {
  await db.query('UPDATE expenses SET status = ?, contest_reason = ?, contested_by_id = ?, contested_at = ?, approved_at = ? WHERE id = ?',
    [status, reason || null, status === 'contested' ? userId : null, status === 'contested' ? new Date() : null, status === 'approved' ? new Date() : null, expenseId]
  );
  const [rows] = await db.query('SELECT * FROM expenses WHERE id = ?', [expenseId]);
  return rows[0];
}

async function registerPayment(expenseId, userId, data) {
  await db.query(`UPDATE expenses SET status = 'paid', payment_method = ?, paid_at = NOW(), payment_receipt_minio_key = ? WHERE id = ?`,
    [data.paymentMethod, data.receiptKey || null, expenseId]
  );
  const [rows] = await db.query('SELECT * FROM expenses WHERE id = ?', [expenseId]);
  return rows[0];
}

async function attachReceipt(expenseId, receiptKey) {
  await db.query('UPDATE expenses SET receipt_minio_key = ? WHERE id = ?', [receiptKey, expenseId]);
}

async function getSummaryByMonth(connectionId, month, userId) {
  const [rows] = await db.query(
    `SELECT status, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE connection_id = ? AND DATE_FORMAT(expense_date, '%Y-%m') = ? AND deleted_at IS NULL GROUP BY status`,
    [connectionId, month || new Date().toISOString().substring(0, 7)]
  );
  const summary = { totalExpenses: 0, byCategory: {}, byStatus: {} };
  rows.forEach(r => {
    summary.totalExpenses += parseFloat(r.total);
    summary.byStatus[r.status] = { total: parseFloat(r.total), count: r.count };
  });
  return summary;
}

function calculateShare(amount, split) {
  const [a] = (split || '50/50').split('/').map(Number);
  return { mine: (amount * a) / 100, theirs: (amount * (100 - a)) / 100 };
}

module.exports = { listByConnection, findById, create, update, softDelete, setStatus, registerPayment, attachReceipt, getSummaryByMonth, calculateShare };
