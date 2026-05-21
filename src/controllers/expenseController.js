const expenseService      = require('../services/expenseService');
const storage             = require('../services/storage');
const notificationService = require('../services/notificationService');

async function listExpenses(req, res, next) {
  try {
    const { page = 1, perPage = 20, ...filters } = req.query;
    const { expenses, total } = await expenseService.listByConnection(req.connectionId, filters, req.userId);
    res.json({ success: true, data: expenses, meta: { page: +page, perPage: +perPage, total } });
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
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
}

async function getExpense(req, res, next) {
  try {
    const expense = await expenseService.findById(req.params.expenseId, req.connectionId);
    if (!expense) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Despesa não encontrada.' } });
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
}

async function updateExpense(req, res, next) {
  try {
    await expenseService.update(req.params.expenseId, req.userId, req.body);
    const expense = await expenseService.findById(req.params.expenseId, req.connectionId);
    res.json({ success: true, data: expense });
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
    res.json({ success: true, data: { status: 'paid', paidAt: expense.paid_at } });
  } catch (err) { next(err); }
}

async function uploadReceipt(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key = await storage.uploadReceipt(req.file, req.params.expenseId);
    await expenseService.attachReceipt(req.params.expenseId, key);
    res.json({ success: true, data: { receiptKey: key } });
  } catch (err) { next(err); }
}

module.exports = { listExpenses, getSummary, createExpense, getExpense, updateExpense, deleteExpense, approveExpense, contestExpense, cancelExpense, registerPayment, uploadReceipt };
