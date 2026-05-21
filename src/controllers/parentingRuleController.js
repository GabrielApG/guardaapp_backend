// =====================================================================
// parentingRuleController.js
// Endpoints do regime de convivência (busca/entrega) por criança.
// =====================================================================

const ruleService  = require('../services/parentingRuleService');
const childService  = require('../services/childService');
const auditService = require('../services/auditService');
const ptime        = require('../services/parentingTimeService');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.status = 400; err.code = code;
  return err;
}

/**
 * Valida o payload de uma regra. `connection` traz user_id_a / user_id_b
 * para garantir que os usuários referenciados pertencem ao casal.
 */
function validateRulePayload(body, connection) {
  const members = [connection.user_id_a, connection.user_id_b];

  if (!members.includes(body.responsibleUserId)) {
    throw fail('responsibleUserId precisa ser um dos co-pais da conexão.');
  }
  for (const wd of ['pickupWeekday', 'dropoffWeekday']) {
    const v = body[wd];
    if (!Number.isInteger(v) || v < 1 || v > 7) {
      throw fail(`${wd} deve ser inteiro de 1 (segunda) a 7 (domingo).`);
    }
  }
  for (const tm of ['pickupTime', 'dropoffTime']) {
    if (!TIME_RE.test(body[tm] || '')) {
      throw fail(`${tm} deve estar no formato HH:MM (24h).`);
    }
  }
  const cadence = body.cadenceWeeks || 1;
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 8) {
    throw fail('cadenceWeeks deve ser inteiro de 1 a 8.');
  }
  // Regra de ouro do FDS alternado: sem âncora não há como calcular a paridade.
  if (cadence > 1 && (!body.anchorDate || !DATE_RE.test(body.anchorDate))) {
    throw fail('anchorDate (YYYY-MM-DD) é obrigatória quando cadenceWeeks > 1: define de quem é o primeiro período.');
  }
  if (!body.effectiveFrom || !DATE_RE.test(body.effectiveFrom)) {
    throw fail('effectiveFrom (YYYY-MM-DD) é obrigatória.');
  }
  if (body.effectiveUntil && !DATE_RE.test(body.effectiveUntil)) {
    throw fail('effectiveUntil deve estar no formato YYYY-MM-DD.');
  }
  for (const u of ['pickupByUserId', 'dropoffByUserId']) {
    if (body[u] && !members.includes(body[u])) {
      throw fail(`${u} precisa ser um dos co-pais da conexão.`);
    }
  }
}

async function listRules(req, res, next) {
  try {
    const child = await childService.findById(req.params.childId, req.connectionId);
    if (!child) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Filho não encontrado.' } });
    const rules = await ruleService.listByChild(req.params.childId, req.connectionId);
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
}

async function createRule(req, res, next) {
  try {
    const child = await childService.findById(req.params.childId, req.connectionId);
    if (!child) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Filho não encontrado.' } });

    validateRulePayload(req.body, req.connection);

    const rule = await ruleService.create(req.connectionId, req.params.childId, req.userId, req.body);

    await auditService.log(
      req.connectionId, req.userId, 'parenting_rule.created',
      `Regra de convivência criada para ${child.name}: ${rule.label || rule.rule_type}.`,
      { ruleId: rule.id, childId: child.id, ruleType: rule.rule_type, cadenceWeeks: rule.cadence_weeks }
    );

    res.status(201).json({ success: true, data: rule });
  } catch (err) { next(err); }
}

async function updateRule(req, res, next) {
  try {
    const existing = await ruleService.findById(req.params.ruleId, req.connectionId);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Regra não encontrada.' } });

    // Valida apenas se os campos sensíveis vierem no patch.
    const merged = { ...mapRuleToCamel(existing), ...req.body };
    validateRulePayload(merged, req.connection);

    await ruleService.update(req.params.ruleId, req.connectionId, req.body);
    const rule = await ruleService.findById(req.params.ruleId, req.connectionId);

    await auditService.log(
      req.connectionId, req.userId, 'parenting_rule.updated',
      `Regra de convivência alterada (requer nova confirmação do co-pai).`,
      { ruleId: rule.id, changes: Object.keys(req.body) }
    );

    res.json({ success: true, data: rule });
  } catch (err) { next(err); }
}

async function deleteRule(req, res, next) {
  try {
    const existing = await ruleService.findById(req.params.ruleId, req.connectionId);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Regra não encontrada.' } });

    await ruleService.softDelete(req.params.ruleId, req.connectionId);
    await auditService.log(
      req.connectionId, req.userId, 'parenting_rule.cancelled',
      `Regra de convivência cancelada.`,
      { ruleId: req.params.ruleId }
    );
    res.json({ success: true, data: { message: 'Regra removida.' } });
  } catch (err) { next(err); }
}

async function confirmRule(req, res, next) {
  try {
    const decision = req.body.decision === 'rejected' ? 'rejected' : 'confirmed';
    const rule = await ruleService.setConfirmation(req.params.ruleId, req.connectionId, req.userId, decision);
    await auditService.log(
      req.connectionId, req.userId, `parenting_rule.${decision}`,
      `Co-pai ${decision === 'confirmed' ? 'confirmou' : 'recusou'} a regra de convivência.`,
      { ruleId: rule.id, status: rule.status }
    );
    res.json({ success: true, data: rule });
  } catch (err) { next(err); }
}

/**
 * Agenda derivada: gera os blocos busca->entrega de todas as regras da
 * criança num intervalo. Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
async function getSchedule(req, res, next) {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      throw fail('Parâmetros from e to (YYYY-MM-DD) são obrigatórios.');
    }
    const rules    = await ruleService.listByChild(req.params.childId, req.connectionId);
    const schedule = ptime.buildSchedule(rules, from, to);
    res.json({ success: true, data: schedule });
  } catch (err) { next(err); }
}

// Normaliza um valor de coluna DATE (mysql2 devolve Date) para 'YYYY-MM-DD'.
function dateStr(v) {
  if (!v) return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// Normaliza TIME para 'HH:MM:SS' string (mysql2 já devolve string).
function timeStr(v) {
  if (!v) return v;
  return String(v);
}

// Helper: converte uma linha (snake_case) para o shape camelCase da API,
// usado para mesclar com um patch parcial antes de revalidar.
function mapRuleToCamel(r) {
  return {
    responsibleUserId: r.responsible_user_id,
    ruleType:          r.rule_type,
    label:             r.label,
    pickupWeekday:     r.pickup_weekday,
    pickupTime:        timeStr(r.pickup_time),
    pickupLocation:    r.pickup_location,
    dropoffWeekday:    r.dropoff_weekday,
    dropoffTime:       timeStr(r.dropoff_time),
    dropoffLocation:   r.dropoff_location,
    pickupByUserId:    r.pickup_by_user_id,
    dropoffByUserId:   r.dropoff_by_user_id,
    cadenceWeeks:      r.cadence_weeks,
    anchorDate:        dateStr(r.anchor_date),
    effectiveFrom:     dateStr(r.effective_from),
    effectiveUntil:    dateStr(r.effective_until),
    priority:          r.priority,
    source:            r.source,
    notes:             r.notes,
  };
}

module.exports = { listRules, createRule, updateRule, deleteRule, confirmRule, getSchedule };
