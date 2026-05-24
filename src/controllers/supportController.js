const supportService = require('../services/supportService');
const auditService   = require('../services/auditService');
const storage        = require('../services/storage');
const pdfExport      = require('../services/pdfExport');
const { BUCKETS }    = require('../config/minio');
const { formatInTimeZone } = require('date-fns-tz');

const RECEIPT_TTL = 3600;

async function resolveReceiptUrl(key) {
  if (!key) return null;
  try { return await storage.generatePresignedUrl(key, BUCKETS.RECEIPTS, RECEIPT_TTL); } catch { return null; }
}

async function sanitizeAgreement(a) {
  return {
    id: a.id, connection_id: a.connection_id, payer_id: a.payer_id, payee_id: a.payee_id,
    payment_mode: a.payment_mode, due_day: a.due_day, readjustment_mode: a.readjustment_mode,
    readjustment_index: a.readjustment_index, legal_basis: a.legal_basis,
    start_date: a.start_date, end_date: a.end_date, notes: a.notes, status: a.status,
    clt_base_salary: a.clt_base_salary || null,
    clt_discount_percentage: a.clt_discount_percentage || null,
    created_by_id: a.created_by_id, created_at: a.created_at,
    items: a.items || [], total_monthly: a.total_monthly || 0,
  };
}

async function sanitizeInstallment(inst) {
  const payments = await Promise.all((inst.payments || []).map(sanitizePayment));
  return {
    id: inst.id, agreement_id: inst.agreement_id, connection_id: inst.connection_id,
    reference_month: inst.reference_month, due_date: inst.due_date,
    amount_due: inst.amount_due, amount_paid: inst.amount_paid, status: inst.status,
    created_at: inst.created_at, updated_at: inst.updated_at,
    payments,
  };
}

async function sanitizePayment(p) {
  const receiptUrl = await resolveReceiptUrl(p.receipt_minio_key);
  return {
    id: p.id, installment_id: p.installment_id, connection_id: p.connection_id,
    paid_by_id: p.paid_by_id, amount: p.amount, payment_mode: p.payment_mode,
    paid_at: p.paid_at, kind: p.kind, reverses_payment_id: p.reverses_payment_id,
    confirmation_status: p.confirmation_status, confirmed_by_id: p.confirmed_by_id,
    confirmed_at: p.confirmed_at, contest_reason: p.contest_reason,
    notes: p.notes, hash: p.hash, created_at: p.created_at,
    hasReceipt: !!p.receipt_minio_key, receiptUrl,
    // receipt_minio_key NUNCA exposta
  };
}

// ── Acordos ──────────────────────────────────────────────────────────────────

async function listAgreements(req, res, next) {
  try {
    const agreements = await supportService.listAgreements(req.connectionId);
    const data = await Promise.all(agreements.map(sanitizeAgreement));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listAgreementsHistory(req, res, next) {
  try {
    const agreements = await supportService.listAgreementsHistory(req.connectionId);
    const data = await Promise.all(agreements.map(sanitizeAgreement));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getAgreement(req, res, next) {
  try {
    const a = await supportService.getAgreement(req.params.id, req.connectionId);
    if (!a) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Acordo não encontrado.' } });
    res.json({ success: true, data: await sanitizeAgreement(a) });
  } catch (err) { next(err); }
}

async function createAgreement(req, res, next) {
  try {
    let legalDocKey = null;
    if (req.file) legalDocKey = await storage.uploadDocument(req.file, req.connectionId, 'support-' + Date.now());
    const agreement = await supportService.createAgreement(req.connectionId, req.userId, { ...req.body, items: JSON.parse(req.body.items || '[]'), legal_doc_minio_key: legalDocKey });
    res.status(201).json({ success: true, data: await sanitizeAgreement(agreement) });
  } catch (err) { next(err); }
}

async function updateAgreement(req, res, next) {
  try {
    const agreement = await supportService.updateAgreement(req.params.id, req.connectionId, req.userId, { ...req.body, items: JSON.parse(req.body.items || '[]') });
    res.json({ success: true, data: await sanitizeAgreement(agreement) });
  } catch (err) { next(err); }
}

async function suspendAgreement(req, res, next) {
  try {
    await supportService.suspendAgreement(req.params.id, req.connectionId, req.userId, req.body.reason);
    res.json({ success: true, data: { suspended: true } });
  } catch (err) { next(err); }
}

async function deactivateAgreement(req, res, next) {
  try {
    await supportService.deactivateAgreement(req.params.id, req.connectionId, req.userId);
    res.json({ success: true, data: { deactivated: true } });
  } catch (err) { next(err); }
}

// ── Parcelas ─────────────────────────────────────────────────────────────────

async function listInstallments(req, res, next) {
  try {
    const { installments, total } = await supportService.listInstallments(req.connectionId, req.query);
    const data = await Promise.all(installments.map(i => sanitizeInstallment({ ...i, payments: [] })));
    res.json({ success: true, data, meta: { total } });
  } catch (err) { next(err); }
}

async function getInstallment(req, res, next) {
  try {
    const inst = await supportService.getInstallment(req.params.id, req.connectionId);
    if (!inst) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Parcela não encontrada.' } });
    res.json({ success: true, data: await sanitizeInstallment(inst) });
  } catch (err) { next(err); }
}

// ── Pagamentos ────────────────────────────────────────────────────────────────

async function registerPayment(req, res, next) {
  try {
    let receiptKey = null, receiptName = null;
    if (req.file) {
      receiptKey  = await storage.uploadReceipt(req.file, req.params.id);
      receiptName = req.file.originalname;
    }
    const result = await supportService.registerPayment(req.params.id, req.connectionId, req.userId, {
      amount:      parseFloat(req.body.amount),
      paymentMode: req.body.paymentMode || req.body.payment_mode,
      paidAt:      req.body.paidAt || req.body.paid_at || null,
      notes:       req.body.notes || null,
      receiptKey, receiptName,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function confirmPayment(req, res, next) {
  try {
    await supportService.confirmPayment(req.params.paymentId, req.connectionId, req.userId);
    res.json({ success: true, data: { confirmed: true } });
  } catch (err) { next(err); }
}

async function contestPayment(req, res, next) {
  try {
    if (!req.body.reason) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo da contestação obrigatório.' } });
    await supportService.contestPayment(req.params.paymentId, req.connectionId, req.userId, req.body.reason);
    res.json({ success: true, data: { contested: true } });
  } catch (err) { next(err); }
}

async function reversePayment(req, res, next) {
  try {
    const result = await supportService.reversePayment(req.params.paymentId, req.connectionId, req.userId, req.body.reason);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Resumo + PDF ──────────────────────────────────────────────────────────────

async function getSummary(req, res, next) {
  try {
    res.json({ success: true, data: await supportService.getSummary(req.connectionId) });
  } catch (err) { next(err); }
}

async function exportExtractPdf(req, res, next) {
  try {
    const { agreementId, from, to, includeReceipts } = req.query;
    const extractData = await supportService.buildExtractData(req.connectionId, {
      agreementId, startMonth: from, endMonth: to,
    });
    const buffer   = await pdfExport.generateSupportExtractPdf(extractData, req.connectionId);
    const filename = `extrato-pensao-${req.connectionId}-${formatInTimeZone(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmm')}.pdf`;
    const url      = await storage.uploadExport(buffer, filename);
    await auditService.log(req.connectionId, req.userId, 'support',
      `Extrato de pensão exportado. Período: ${from || 'início'} a ${to || 'atual'}`,
      { action: 'extract_exported', agreementId, from, to });
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
}

module.exports = {
  listAgreements, listAgreementsHistory, getAgreement, createAgreement, updateAgreement, suspendAgreement, deactivateAgreement,
  listInstallments, getInstallment,
  registerPayment, confirmPayment, contestPayment, reversePayment,
  getSummary, exportExtractPdf,
};
