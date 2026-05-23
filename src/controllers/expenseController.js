const expenseService      = require('../services/expenseService');
const storage             = require('../services/storage');
const notificationService = require('../services/notificationService');
const { BUCKETS }         = require('../config/minio');

const RECEIPT_TTL = 3600; // 1 hora

async function resolveReceiptUrl(key) {
  if (!key) return null;
  try { return await storage.generatePresignedUrl(key, BUCKETS.RECEIPTS, RECEIPT_TTL); }
  catch (_) { return null; }
}

// Sanitização completa (com presigned URLs) — usada apenas no detalhe individual.
// Na listagem, presigned URLs não são geradas para evitar N×2 chamadas ao MinIO
// que causam timeout de 10s no cliente quando há muitas despesas.
async function sanitizeExpense(e, { withUrls = false } = {}) {
  let receiptUrl        = null;
  let paymentReceiptUrl = null;
  if (withUrls) {
    [receiptUrl, paymentReceiptUrl] = await Promise.all([
      resolveReceiptUrl(e.receipt_minio_key),
      resolveReceiptUrl(e.payment_receipt_minio_key),
    ]);
  }
  return {
    id:              e.id,
    title:           e.title,
    description:     e.description ?? null,
    category:        e.category,
    amount:          e.amount,
    split_ratio:     e.split_ratio,
    status:          e.status,
    submitted_by_id: e.submitted_by_id,
    contest_reason:  e.contest_reason ?? null,
    receipt_name:    e.receipt_name ?? null,
    paid_at:         e.paid_at ?? null,
    approved_at:     e.approved_at ?? null,
    expense_date:    e.expense_date,
    child_id:        e.child_id,
    connection_id:   e.connection_id,
    created_at:      e.created_at,
    hasReceipt:          !!e.receipt_minio_key,
    hasPaymentReceipt:   !!e.payment_receipt_minio_key,
    receiptUrl,
    paymentReceiptUrl,
    // _minio_key nunca exposta ao cliente
  };
}

async function listExpenses(req, res, next) {
  try {
    const { page = 1, perPage = 20, ...filters } = req.query;
    const { expenses, total } = await expenseService.listByConnection(req.connectionId, filters, req.userId);
    // withUrls: false — presigned URLs omitidas na lista para evitar N×2 chamadas MinIO (timeout)
    const data = await Promise.all(expenses.map(e => sanitizeExpense(e, { withUrls: false })));
    res.json({ success: true, data, meta: { page: +page, perPage: +perPage, total } });
  } catch (err) { next(err); }
}

async function getSummary(req, res, next) {
  try {
    const summary = await expenseService.getSummaryByMonth(req.connectionId, req.query.month, req.userId);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
}

async function createExpense(req, res, next) {
  try {
    let receiptKey = null;
    if (req.file) receiptKey = await storage.uploadReceipt(req.file, req.body.childId || 'general');
    const expense = await expenseService.create(req.connectionId, req.userId, { ...req.body, receiptKey });
    await notificationService.notifyNewExpense(req.connectionId, req.userId);
    res.status(201).json({ success: true, data: await sanitizeExpense(expense, { withUrls: true }) });
  } catch (err) { next(err); }
}

async function getExpense(req, res, next) {
  try {
    const expense = await expenseService.findById(req.params.expenseId, req.connectionId);
    if (!expense) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Despesa não encontrada.' } });
    res.json({ success: true, data: await sanitizeExpense(expense, { withUrls: true }) });
  } catch (err) { next(err); }
}

async function updateExpense(req, res, next) {
  try {
    await expenseService.update(req.params.expenseId, req.userId, req.body);
    const expense = await expenseService.findById(req.params.expenseId, req.connectionId);
    res.json({ success: true, data: await sanitizeExpense(expense, { withUrls: true }) });
  } catch (err) { next(err); }
}

async function deleteExpense(req, res, next) {
  try {
    await expenseService.softDelete(req.params.expenseId, req.userId);
    res.json({ success: true, data: { message: 'Despesa removida.' } });
  } catch (err) { next(err); }
}

async function approveExpense(req, res, next) {
  try {
    const expense = await expenseService.setStatus(req.params.expenseId, req.userId, 'approved');
    await notificationService.notifyCoparent(req.connectionId, req.userId, 'expense_approved', {});
    res.json({ success: true, data: { status: expense.status, approvedAt: expense.approved_at } });
  } catch (err) { next(err); }
}

async function contestExpense(req, res, next) {
  try {
    const expense = await expenseService.setStatus(req.params.expenseId, req.userId, 'contested', req.body.reason);
    await notificationService.notifyCoparent(req.connectionId, req.userId, 'expense_contested', {});
    res.json({ success: true, data: { status: expense.status, contestReason: expense.contest_reason } });
  } catch (err) { next(err); }
}

async function cancelExpense(req, res, next) {
  try {
    const expense = await expenseService.setStatus(req.params.expenseId, req.userId, 'cancelled');
    res.json({ success: true, data: { status: expense.status } });
  } catch (err) { next(err); }
}

async function registerPayment(req, res, next) {
  try {
    let receiptKey = null;
    if (req.file) receiptKey = await storage.uploadReceipt(req.file, req.params.expenseId);
    const expense = await expenseService.registerPayment(req.params.expenseId, req.userId, { ...req.body, receiptKey });
    const paymentReceiptUrl = await resolveReceiptUrl(expense.payment_receipt_minio_key);
    res.json({ success: true, data: { status: 'paid', paidAt: expense.paid_at, paymentReceiptUrl } });
  } catch (err) { next(err); }
}

async function uploadReceipt(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key = await storage.uploadReceipt(req.file, req.params.expenseId);
    await expenseService.attachReceipt(req.params.expenseId, key);
    const receiptUrl = await resolveReceiptUrl(key);
    res.json({ success: true, data: { receiptUrl } });
  } catch (err) { next(err); }
}

module.exports = { listExpenses, getSummary, createExpense, getExpense, updateExpense, deleteExpense, approveExpense, contestExpense, cancelExpense, registerPayment, uploadReceipt };
