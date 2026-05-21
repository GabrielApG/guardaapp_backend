// =====================================================================
// parentingRuleService.js
// Persistência das regras de convivência (parenting_time_rules).
// Camada de banco. A lógica de cálculo da agenda fica em
// parentingTimeService.js (funções puras, sem dependência de banco).
// =====================================================================

const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Mapeia o payload da API (camelCase) para as colunas (snake_case).
const COLUMN_MAP = {
  responsibleUserId: 'responsible_user_id',
  ruleType:          'rule_type',
  label:             'label',
  pickupWeekday:     'pickup_weekday',
  pickupTime:        'pickup_time',
  pickupLocation:    'pickup_location',
  dropoffWeekday:    'dropoff_weekday',
  dropoffTime:       'dropoff_time',
  dropoffLocation:   'dropoff_location',
  pickupByUserId:    'pickup_by_user_id',
  dropoffByUserId:   'dropoff_by_user_id',
  cadenceWeeks:      'cadence_weeks',
  anchorDate:        'anchor_date',
  effectiveFrom:     'effective_from',
  effectiveUntil:    'effective_until',
  priority:          'priority',
  source:            'source',
  notes:             'notes',
};

async function listByChild(childId, connectionId) {
  const [rows] = await db.query(
    'SELECT * FROM parenting_time_rules WHERE child_id = ? AND connection_id = ? AND is_active = 1 ORDER BY priority DESC, created_at ASC',
    [childId, connectionId]
  );
  return rows;
}

async function findById(ruleId, connectionId) {
  const [rows] = await db.query(
    'SELECT * FROM parenting_time_rules WHERE id = ? AND connection_id = ? AND is_active = 1',
    [ruleId, connectionId]
  );
  return rows[0] || null;
}

async function create(connectionId, childId, createdBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO parenting_time_rules
       (id, connection_id, child_id, created_by_user_id,
        responsible_user_id, rule_type, label,
        pickup_weekday, pickup_time, pickup_location,
        dropoff_weekday, dropoff_time, dropoff_location,
        pickup_by_user_id, dropoff_by_user_id,
        cadence_weeks, anchor_date,
        effective_from, effective_until,
        priority, source, notes,
        confirmed_by_creator, confirmed_by_coparent, status)
     VALUES (?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?,  ?, ?,  ?, ?,  ?, ?, ?,  1, 0, 'pending')`,
    [
      id, connectionId, childId, createdBy,
      data.responsibleUserId, data.ruleType || 'weekly', data.label || null,
      data.pickupWeekday, data.pickupTime, data.pickupLocation || null,
      data.dropoffWeekday, data.dropoffTime, data.dropoffLocation || null,
      data.pickupByUserId || null, data.dropoffByUserId || null,
      data.cadenceWeeks || 1, data.anchorDate || null,
      data.effectiveFrom, data.effectiveUntil || null,
      data.priority || 0, data.source || 'acordo', data.notes || null,
    ]
  );
  return findById(id, connectionId);
}

async function update(ruleId, connectionId, data) {
  const fields = Object.entries(data)
    .filter(([k]) => COLUMN_MAP[k])
    .map(([k, v]) => [COLUMN_MAP[k], v]);
  if (!fields.length) return;
  // Alterar uma regra confirmada exige reconfirmação do co-pai.
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(
    `UPDATE parenting_time_rules
       SET ${sets}, confirmed_by_coparent = 0, status = 'pending'
     WHERE id = ? AND connection_id = ?`,
    [...fields.map(([, v]) => v), ruleId, connectionId]
  );
}

async function softDelete(ruleId, connectionId) {
  await db.query(
    "UPDATE parenting_time_rules SET is_active = 0, status = 'cancelled', deleted_at = NOW() WHERE id = ? AND connection_id = ?",
    [ruleId, connectionId]
  );
}

/**
 * Confirmação bilateral. O criador já entra confirmado; quando o co-pai
 * confirma, a regra vira 'active'. Recusar mantém 'pending'.
 */
async function setConfirmation(ruleId, connectionId, userId, decision) {
  const rule = await findById(ruleId, connectionId);
  if (!rule) {
    const err = new Error('Regra de convivência não encontrada.');
    err.status = 404; err.code = 'NOT_FOUND'; throw err;
  }
  const isCreator = rule.created_by_user_id === userId;
  const field     = isCreator ? 'confirmed_by_creator' : 'confirmed_by_coparent';
  const value     = decision === 'confirmed' ? 1 : 0;
  await db.query(`UPDATE parenting_time_rules SET ${field} = ? WHERE id = ?`, [value, ruleId]);

  const updated = await findById(ruleId, connectionId);
  let status = 'pending';
  if (updated.confirmed_by_creator && updated.confirmed_by_coparent) status = 'active';
  await db.query('UPDATE parenting_time_rules SET status = ? WHERE id = ?', [status, ruleId]);
  return { ...updated, status };
}

module.exports = { listByChild, findById, create, update, softDelete, setConfirmation };
