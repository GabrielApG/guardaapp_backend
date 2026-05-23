const db = require('../../config/database');
const adminAuditService = require('./adminAuditService');

async function listFlags(filters = {}) {
  let sql = `SELECT mf.*, cc.id as conn_id FROM moderation_flags mf LEFT JOIN coparent_connections cc ON mf.connection_id = cc.id WHERE 1=1`;
  const params = [];
  if (filters.status)   { sql += ' AND mf.status = ?';   params.push(filters.status); }
  if (filters.severity) { sql += ' AND mf.severity = ?'; params.push(filters.severity); }
  const limit  = parseInt(filters.limit) || 20;
  const offset = ((parseInt(filters.page) || 1) - 1) * limit;
  sql += ' ORDER BY mf.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [flags]       = await db.query(sql, params);
  const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM moderation_flags');
  return { flags, total };
}

async function findById(flagId) {
  const [rows] = await db.query('SELECT * FROM moderation_flags WHERE id = ?', [flagId]);
  if (!rows.length) return null;
  const flag = rows[0];
  // GUARDRAIL: expõe apenas metadados do trecho sinalizado — nunca conteúdo completo
  return {
    id:           flag.id,
    connection_id: flag.connection_id,
    content_type: flag.content_type,
    content_id:   flag.content_id,
    reason:       flag.reason,
    severity:     flag.severity,
    status:       flag.status,
    reviewed_by_id: flag.reviewed_by_id,
    reviewed_at:  flag.reviewed_at,
    notes:        flag.notes,
    created_at:   flag.created_at,
    // Trecho sinalizado — somente o fragmento já marcado pelo filtro de hostilidade
    contentPreview: '[Trecho sinalizado pelo sistema — contexto mínimo para decisão]',
  };
}

async function resolveFlag(actorId, flagId, { decision, notes }, ip) {
  const status = decision === 'procedente' ? 'procedente' : 'improcedente';
  await db.query(
    'UPDATE moderation_flags SET status = ?, reviewed_by_id = ?, reviewed_at = NOW(), notes = ? WHERE id = ?',
    [status, actorId, notes || null, flagId]
  );
  await adminAuditService.log(actorId, 'moderation.resolve', {
    targetType: 'moderation_flag', targetId: flagId,
    description: `Flag resolvida como ${decision}. Notas: ${notes || '-'}`, ip,
  });
}

module.exports = { listFlags, findById, resolveFlag };
