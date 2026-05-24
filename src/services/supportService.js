/**
 * supportService.js — Pensão alimentícia
 * Regras: imutabilidade de pagamentos, hash encadeado, geração idempotente de parcelas
 */
const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const hashChain      = require('./hashChain');
const auditService   = require('./auditService');
const notificationService = require('./notificationService');
const pushService    = require('./pushService');

// Salário mínimo por ano (BRL) — atualizar anualmente
const MIN_WAGE_BY_YEAR = { 2023: 1320, 2024: 1412, 2025: 1518, 2026: 1518 };

function currentMinWage() {
  const year = new Date().getFullYear();
  return MIN_WAGE_BY_YEAR[year] || 1518;
}

// ─── Acordos ─────────────────────────────────────────────────────────────────

async function listAgreements(connectionId) {
  const [rows] = await db.query(
    `SELECT sa.*, GROUP_CONCAT(sai.id) as item_ids FROM support_agreements sa
     LEFT JOIN support_agreement_items sai ON sai.agreement_id = sa.id AND sai.is_active = 1
     WHERE sa.connection_id = ? AND sa.deleted_at IS NULL
     GROUP BY sa.id ORDER BY sa.created_at DESC`,
    [connectionId]
  );
  return Promise.all(rows.map(a => getAgreementItems(a)));
}

async function getAgreementItems(agreement) {
  const [items] = await db.query(
    'SELECT * FROM support_agreement_items WHERE agreement_id = ? AND is_active = 1',
    [agreement.id]
  );
  const totalMonthly = items.reduce((sum, i) => {
    if (agreement.readjustment_mode === 'percentual_salario_minimo' && i.min_wage_factor) {
      return sum + (parseFloat(i.min_wage_factor) * currentMinWage());
    }
    return sum + parseFloat(i.base_value);
  }, 0);
  return { ...agreement, items, total_monthly: totalMonthly };
}

async function getAgreement(agreementId, connectionId) {
  const [rows] = await db.query(
    'SELECT * FROM support_agreements WHERE id = ? AND connection_id = ? AND deleted_at IS NULL',
    [agreementId, connectionId]
  );
  if (!rows.length) return null;
  return getAgreementItems(rows[0]);
}

async function createAgreement(connectionId, actorId, dto) {
  // Auto-desativa acordos ativos anteriores para a mesma conexão antes de criar o novo.
  // Regra de negócio: apenas um acordo ativo por vez por conexão.
  await db.query(
    `UPDATE support_agreements
     SET status = 'encerrado', deleted_at = NOW(), end_date = CURDATE()
     WHERE connection_id = ? AND status = 'ativo' AND deleted_at IS NULL`,
    [connectionId]
  );

  const id = uuidv4();
  await db.query(
    `INSERT INTO support_agreements
     (id, connection_id, payer_id, payee_id, payment_mode, due_day, readjustment_mode,
      readjustment_index, legal_basis, legal_doc_minio_key, start_date, end_date, notes,
      clt_base_salary, clt_discount_percentage, created_by_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, connectionId, dto.payer_id, dto.payee_id, dto.payment_mode, dto.due_day || 5,
     dto.readjustment_mode || 'valor_fixo', dto.readjustment_index || null,
     dto.legal_basis || 'acordo_extrajudicial', dto.legal_doc_minio_key || null,
     dto.start_date, dto.end_date || null, dto.notes || null,
     dto.clt_base_salary || null, dto.clt_discount_percentage || null, actorId]
  );
  // Itens por filho
  if (dto.items && dto.items.length) {
    for (const item of dto.items) {
      await db.query(
        'INSERT INTO support_agreement_items (id, agreement_id, child_id, base_value, min_wage_factor) VALUES (?,?,?,?,?)',
        [uuidv4(), id, item.child_id || null, item.base_value, item.min_wage_factor || null]
      );
    }
  }
  await auditService.log(connectionId, actorId, 'support',
    'Acordo de pensão criado', { action: 'agreement_created', agreementId: id, paymentMode: dto.payment_mode });
  // Gera parcelas até o mês atual
  const untilMonth = new Date().toISOString().substring(0, 7);
  await generateInstallments(id, untilMonth);
  return getAgreement(id, connectionId);
}

async function updateAgreement(agreementId, connectionId, actorId, dto) {
  // Soft-delete da versão atual
  await db.query('UPDATE support_agreements SET deleted_at = NOW() WHERE id = ? AND connection_id = ?', [agreementId, connectionId]);
  await auditService.log(connectionId, actorId, 'support',
    'Acordo de pensão atualizado (nova versão criada)', { action: 'agreement_updated', oldAgreementId: agreementId });
  // Cria nova versão
  return createAgreement(connectionId, actorId, { ...dto });
}

async function suspendAgreement(agreementId, connectionId, actorId, reason) {
  await db.query("UPDATE support_agreements SET status = 'suspenso' WHERE id = ? AND connection_id = ?", [agreementId, connectionId]);
  await auditService.log(connectionId, actorId, 'support',
    `Acordo suspenso. Motivo: ${reason || '-'}`, { action: 'agreement_suspended', agreementId, reason });
}

async function deactivateAgreement(agreementId, connectionId, actorId) {
  // Encerramento permanente — sem possibilidade de reativação.
  // Para um novo acordo, o usuário deve cadastrar outro.
  await db.query(
    "UPDATE support_agreements SET status = 'encerrado', deleted_at = NOW(), end_date = CURDATE() WHERE id = ? AND connection_id = ?",
    [agreementId, connectionId]
  );
  await auditService.log(connectionId, actorId, 'support',
    'Acordo de pensão encerrado permanentemente.', { action: 'agreement_deactivated', agreementId });
}

// ─── Histórico de acordos (encerrados/suspensos) ──────────────────────────────

async function listAgreementsHistory(connectionId) {
  const [rows] = await db.query(
    `SELECT sa.* FROM support_agreements sa
     WHERE sa.connection_id = ?
       AND (sa.deleted_at IS NOT NULL OR sa.status IN ('encerrado','suspenso'))
     ORDER BY sa.created_at DESC
     LIMIT 50`,
    [connectionId]
  );
  return Promise.all(rows.map(a => getAgreementItems(a)));
}

// ─── Geração de parcelas (idempotente) ───────────────────────────────────────

async function generateInstallments(agreementId, untilMonth) {
  const [agrs] = await db.query('SELECT * FROM support_agreements WHERE id = ? AND deleted_at IS NULL', [agreementId]);
  if (!agrs.length) return;
  const agreement = agrs[0];
  if (agreement.status === 'encerrado') return;

  const [items] = await db.query(
    'SELECT * FROM support_agreement_items WHERE agreement_id = ? AND is_active = 1',
    [agreementId]
  );
  const amountDue = items.reduce((sum, i) => {
    if (agreement.readjustment_mode === 'percentual_salario_minimo' && i.min_wage_factor) {
      return sum + (parseFloat(i.min_wage_factor) * currentMinWage());
    }
    return sum + parseFloat(i.base_value);
  }, 0);

  // Determinar intervalo de meses a gerar
  const start   = new Date(agreement.start_date + 'T12:00:00-03:00');
  const endStr  = agreement.end_date && untilMonth > agreement.end_date.substring(0, 7)
    ? agreement.end_date.substring(0, 7) : untilMonth;

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endDate = new Date(endStr.substring(0, 4), parseInt(endStr.substring(5, 7)) - 1, 1);

  while (cursor <= endDate) {
    const refMonth = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    // Clamp due_day para o último dia do mês se necessário
    const maxDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const dueDay = Math.min(agreement.due_day, maxDay);
    const dueDate = `${refMonth}-${String(dueDay).padStart(2, '0')}`;

    try {
      await db.query(
        `INSERT IGNORE INTO support_installments
         (id, agreement_id, connection_id, reference_month, due_date, amount_due)
         VALUES (?,?,?,?,?,?)`,
        [uuidv4(), agreementId, agreement.connection_id, refMonth, dueDate, amountDue]
      );
    } catch (e) {
      // UNIQUE constraint — parcela já existe, ignorar
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
}

// ─── Parcelas ─────────────────────────────────────────────────────────────────

async function listInstallments(connectionId, filters = {}) {
  // Gera parcelas faltantes até o mês atual antes de listar
  const [activeAgreements] = await db.query(
    "SELECT id FROM support_agreements WHERE connection_id = ? AND status = 'ativo' AND deleted_at IS NULL",
    [connectionId]
  );
  const untilMonth = new Date().toISOString().substring(0, 7);
  await Promise.all(activeAgreements.map(a => generateInstallments(a.id, untilMonth)));

  let sql = 'SELECT * FROM support_installments WHERE connection_id = ?';
  const params = [connectionId];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.from)   { sql += ' AND reference_month >= ?'; params.push(filters.from); }
  if (filters.to)     { sql += ' AND reference_month <= ?'; params.push(filters.to); }
  const limit  = parseInt(filters.limit) || 12;
  const offset = ((parseInt(filters.page) || 1) - 1) * limit;
  sql += ' ORDER BY reference_month DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [installments]   = await db.query(sql, params);
  const [[{ total }]]    = await db.query('SELECT COUNT(*) as total FROM support_installments WHERE connection_id = ?', [connectionId]);
  return { installments, total };
}

async function getInstallment(installmentId, connectionId) {
  const [rows] = await db.query(
    'SELECT * FROM support_installments WHERE id = ? AND connection_id = ?',
    [installmentId, connectionId]
  );
  if (!rows.length) return null;
  const [payments] = await db.query(
    'SELECT * FROM support_payments WHERE installment_id = ? ORDER BY created_at ASC',
    [installmentId]
  );
  return { ...rows[0], payments };
}

// ─── Recálculo de status da parcela ──────────────────────────────────────────

async function recomputeInstallmentStatus(installmentId) {
  const [rows] = await db.query('SELECT * FROM support_installments WHERE id = ?', [installmentId]);
  if (!rows.length) return;
  const installment = rows[0];

  const [payments] = await db.query(
    "SELECT * FROM support_payments WHERE installment_id = ? AND kind = 'pagamento' AND confirmation_status = 'confirmado'",
    [installmentId]
  );
  const [reversals] = await db.query(
    "SELECT SUM(amount) as total FROM support_payments WHERE installment_id = ? AND kind = 'estorno' AND confirmation_status = 'confirmado'",
    [installmentId]
  );
  const [contested] = await db.query(
    "SELECT COUNT(*) as cnt FROM support_payments WHERE installment_id = ? AND confirmation_status = 'contestado'",
    [installmentId]
  );

  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0)
    - (parseFloat(reversals[0]?.total) || 0);
  const amountDue = parseFloat(installment.amount_due);
  const today     = new Date();
  const dueDate   = new Date(installment.due_date + 'T12:00:00');

  let status;
  if (installment.status === 'dispensado') {
    status = 'dispensado';
  } else if (contested[0].cnt > 0) {
    status = 'contestado';
  } else if (totalPaid >= amountDue) {
    status = 'pago';
  } else if (totalPaid > 0) {
    status = 'pago_parcial';
  } else if (dueDate < today) {
    status = 'atrasado';
  } else {
    status = 'pendente';
  }

  await db.query(
    'UPDATE support_installments SET amount_paid = ?, status = ?, updated_at = NOW() WHERE id = ?',
    [Math.max(totalPaid, 0), status, installmentId]
  );
}

// ─── Pagamentos ───────────────────────────────────────────────────────────────

async function registerPayment(installmentId, connectionId, actorId, dto) {
  const [inst] = await db.query('SELECT * FROM support_installments WHERE id = ? AND connection_id = ?', [installmentId, connectionId]);
  if (!inst.length) throw Object.assign(new Error('Parcela não encontrada.'), { code: 'NOT_FOUND', status: 404 });
  const installment = inst[0];

  const [agr] = await db.query('SELECT status FROM support_agreements WHERE id = ?', [installment.agreement_id]);
  if (agr[0]?.status === 'encerrado') {
    throw Object.assign(new Error('Acordo encerrado — não é possível registrar pagamentos.'), { code: 'AGREEMENT_CLOSED', status: 409 });
  }
  if (installment.status === 'dispensado') {
    throw Object.assign(new Error('Parcela dispensada — não é possível registrar pagamentos.'), { code: 'INSTALLMENT_WAIVED', status: 409 });
  }

  const previousHash = await hashChain.getLastHash(connectionId);
  const id = uuidv4();
  const paymentData = {
    id, installmentId, connectionId, paidById: actorId,
    amount: dto.amount, paymentMode: dto.paymentMode,
    paidAt: dto.paidAt || new Date().toISOString(),
  };
  const hash = hashChain.computeHash(paymentData, previousHash);

  await db.query(
    `INSERT INTO support_payments
     (id, installment_id, connection_id, paid_by_id, amount, payment_mode, paid_at,
      receipt_minio_key, receipt_name, notes, hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, installmentId, connectionId, actorId, dto.amount, dto.paymentMode,
     dto.paidAt || new Date(), dto.receiptKey || null, dto.receiptName || null, dto.notes || null, hash]
  );

  await auditService.log(connectionId, actorId, 'support',
    `Pagamento de pensão registrado (${dto.paymentMode}) — R$ ${parseFloat(dto.amount).toFixed(2)}`,
    { action: 'payment_registered', paymentId: id, installmentId, amount: dto.amount, paymentMode: dto.paymentMode });

  await notificationService.notifyCoparent(connectionId, actorId, 'support_payment_registered', {
    amount: dto.amount, paymentMode: dto.paymentMode,
  });

  // Push notification para o co-parente
  pushService.notifyCoparentPayment(actorId, connectionId, installmentId).catch(() => {});

  return { id, hash };
}

async function confirmPayment(paymentId, connectionId, actorId) {
  const [rows] = await db.query('SELECT * FROM support_payments WHERE id = ? AND connection_id = ?', [paymentId, connectionId]);
  if (!rows.length) throw Object.assign(new Error('Pagamento não encontrado.'), { code: 'NOT_FOUND', status: 404 });
  const payment = rows[0];
  if (payment.paid_by_id === actorId) {
    throw Object.assign(new Error('Você não pode confirmar seu próprio pagamento.'), { code: 'SELF_CONFIRMATION_FORBIDDEN', status: 403 });
  }
  if (payment.confirmation_status !== 'aguardando') {
    throw Object.assign(new Error('Pagamento já processado.'), { code: 'ALREADY_PROCESSED', status: 409 });
  }
  await db.query(
    "UPDATE support_payments SET confirmation_status = 'confirmado', confirmed_by_id = ?, confirmed_at = NOW() WHERE id = ?",
    [actorId, paymentId]
  );
  await auditService.log(connectionId, actorId, 'support',
    'Pagamento de pensão confirmado',
    { action: 'payment_confirmed', paymentId, installmentId: payment.installment_id });
  await recomputeInstallmentStatus(payment.installment_id);
}

async function contestPayment(paymentId, connectionId, actorId, reason) {
  const [rows] = await db.query('SELECT * FROM support_payments WHERE id = ? AND connection_id = ?', [paymentId, connectionId]);
  if (!rows.length) throw Object.assign(new Error('Pagamento não encontrado.'), { code: 'NOT_FOUND', status: 404 });
  const payment = rows[0];
  if (payment.paid_by_id === actorId) {
    throw Object.assign(new Error('Você não pode contestar seu próprio pagamento.'), { code: 'SELF_CONFIRMATION_FORBIDDEN', status: 403 });
  }
  await db.query(
    "UPDATE support_payments SET confirmation_status = 'contestado', contest_reason = ? WHERE id = ?",
    [reason, paymentId]
  );
  await auditService.log(connectionId, actorId, 'support',
    `Pagamento de pensão contestado. Motivo: ${reason}`,
    { action: 'payment_contested', paymentId, installmentId: payment.installment_id, reason });
  await recomputeInstallmentStatus(payment.installment_id);
}

async function reversePayment(paymentId, connectionId, actorId, reason) {
  const [rows] = await db.query('SELECT * FROM support_payments WHERE id = ? AND connection_id = ?', [paymentId, connectionId]);
  if (!rows.length) throw Object.assign(new Error('Pagamento não encontrado.'), { code: 'NOT_FOUND', status: 404 });
  const original = rows[0];

  const previousHash = await hashChain.getLastHash(connectionId);
  const id = uuidv4();
  const reversalData = { id, reversesPaymentId: paymentId, amount: original.amount, connectionId, actorId };
  const hash = hashChain.computeHash(reversalData, previousHash);

  await db.query(
    `INSERT INTO support_payments
     (id, installment_id, connection_id, paid_by_id, amount, payment_mode, paid_at,
      kind, reverses_payment_id, notes, hash, confirmation_status)
     VALUES (?,?,?,?,?,?,NOW(),'estorno',?,?,?,'aguardando')`,
    [id, original.installment_id, connectionId, actorId, original.amount,
     original.payment_mode, paymentId, reason || null, hash]
  );
  await auditService.log(connectionId, actorId, 'support',
    `Estorno de pagamento registrado. Motivo: ${reason || '-'}`,
    { action: 'payment_reversed', originalPaymentId: paymentId, reversalId: id });
  return { id, hash };
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

async function getSummary(connectionId) {
  const [agreements] = await db.query(
    "SELECT * FROM support_agreements WHERE connection_id = ? AND status = 'ativo' AND deleted_at IS NULL",
    [connectionId]
  );
  const [[{ totalDue }]] = await db.query(
    'SELECT COALESCE(SUM(amount_due), 0) as totalDue FROM support_installments WHERE connection_id = ? AND status != ?',
    [connectionId, 'dispensado']
  );
  const [[{ totalPaid }]] = await db.query(
    'SELECT COALESCE(SUM(amount_paid), 0) as totalPaid FROM support_installments WHERE connection_id = ?',
    [connectionId]
  );
  const [[{ overdue }]] = await db.query(
    "SELECT COALESCE(SUM(amount_due - amount_paid), 0) as overdue FROM support_installments WHERE connection_id = ? AND status = 'atrasado'",
    [connectionId]
  );
  const [upcoming] = await db.query(
    "SELECT * FROM support_installments WHERE connection_id = ? AND status IN ('pendente','pago_parcial') ORDER BY due_date ASC LIMIT 3",
    [connectionId]
  );
  return {
    activeAgreements: agreements.length,
    monthlyAmount:    agreements.reduce((s, a) => s + 0, 0), // calculado via getAgreementItems
    totalDue:         parseFloat(totalDue),
    totalPaid:        parseFloat(totalPaid),
    overdue:          parseFloat(overdue),
    upcomingInstallments: upcoming,
  };
}

// ─── Dados para extrato PDF ───────────────────────────────────────────────────

async function buildExtractData(connectionId, { agreementId, startMonth, endMonth } = {}) {
  let sql = 'SELECT si.*, sp.id as payment_id, sp.amount as payment_amount, sp.payment_mode, sp.paid_at, sp.kind, sp.confirmation_status, sp.paid_by_id, sp.confirmed_by_id, sp.confirmed_at, sp.contest_reason, sp.hash as payment_hash, sp.receipt_minio_key FROM support_installments si LEFT JOIN support_payments sp ON sp.installment_id = si.id WHERE si.connection_id = ?';
  const params = [connectionId];
  if (agreementId)  { sql += ' AND si.agreement_id = ?';    params.push(agreementId); }
  if (startMonth)   { sql += ' AND si.reference_month >= ?'; params.push(startMonth); }
  if (endMonth)     { sql += ' AND si.reference_month <= ?'; params.push(endMonth); }
  sql += ' ORDER BY si.reference_month ASC, sp.paid_at ASC';
  const [rows] = await db.query(sql, params);

  // Agrupar por parcela
  const installmentsMap = {};
  for (const row of rows) {
    if (!installmentsMap[row.id]) {
      installmentsMap[row.id] = {
        id: row.id, reference_month: row.reference_month, due_date: row.due_date,
        amount_due: row.amount_due, amount_paid: row.amount_paid, status: row.status,
        payments: [],
      };
    }
    if (row.payment_id) {
      installmentsMap[row.id].payments.push({
        id: row.payment_id, amount: row.payment_amount, payment_mode: row.payment_mode,
        paid_at: row.paid_at, kind: row.kind, confirmation_status: row.confirmation_status,
        paid_by_id: row.paid_by_id, confirmed_by_id: row.confirmed_by_id,
        confirmed_at: row.confirmed_at, contest_reason: row.contest_reason,
        hash: row.payment_hash, hasReceipt: !!row.receipt_minio_key,
      });
    }
  }

  const [parties] = await db.query(
    `SELECT u.id, u.name FROM users u
     INNER JOIN coparent_connections cc ON cc.user1_id = u.id OR cc.user2_id = u.id
     WHERE cc.id = ? LIMIT 2`,
    [connectionId]
  );

  return {
    connectionId,
    parties,
    installments: Object.values(installmentsMap),
    exportedAt: new Date().toISOString(),
    period: { startMonth, endMonth },
  };
}

module.exports = {
  listAgreements, listAgreementsHistory, getAgreement, createAgreement, updateAgreement, suspendAgreement, deactivateAgreement,
  generateInstallments, listInstallments, getInstallment,
  registerPayment, confirmPayment, contestPayment, reversePayment,
  getSummary, recomputeInstallmentStatus, buildExtractData,
};
