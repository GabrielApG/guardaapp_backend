const db = require('../../config/database');
const adminAuditService = require('./adminAuditService');

async function list(filters = {}) {
  let sql = `SELECT u.id, u.name, u.email,
    CASE WHEN u.is_active = 1 THEN 'active' ELSE 'suspended' END AS status,
    u.created_at,
    (SELECT COUNT(*) FROM children c WHERE c.connection_id IN (SELECT id FROM coparent_connections WHERE user_id_a = u.id OR user_id_b = u.id)) as children_count,
    (SELECT COUNT(*) FROM coparent_connections WHERE user_id_a = u.id OR user_id_b = u.id) as connections_count
    FROM users u WHERE u.deleted_at IS NULL`;
  const params = [];
  if (filters.search) {
    sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    sql += ' AND u.is_active = ?';
    params.push(filters.status === 'active' ? 1 : 0);
  }
  const limit  = parseInt(filters.limit) || 20;
  const offset = ((parseInt(filters.page) || 1) - 1) * limit;
  sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [users] = await db.query(sql, params);
  const [countRow] = await db.query('SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL');
  return { users, total: countRow[0].total };
}

async function findById(userId) {
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email,
     CASE WHEN u.is_active = 1 THEN 'active' ELSE 'suspended' END AS status,
     u.role, u.created_at, u.updated_at,
     (SELECT COUNT(*) FROM children c WHERE c.connection_id IN (SELECT id FROM coparent_connections WHERE user_id_a = u.id OR user_id_b = u.id)) as children_count,
     (SELECT COUNT(*) FROM messages WHERE connection_id IN (SELECT id FROM coparent_connections WHERE user_id_a = u.id OR user_id_b = u.id) AND sender_id = u.id) as messages_count,
     (SELECT COUNT(*) FROM expenses WHERE connection_id IN (SELECT id FROM coparent_connections WHERE user_id_a = u.id OR user_id_b = u.id) AND submitted_by_id = u.id) as expenses_count
     FROM users u WHERE u.id = ? AND u.deleted_at IS NULL`,
    [userId]
  );
  return rows[0] || null;
}

async function suspend(actorId, userId, reason, ip) {
  await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
  await adminAuditService.log(actorId, 'user.suspend', {
    targetType: 'user', targetId: userId,
    description: `Usuário suspenso. Motivo: ${reason}`, ip,
  });
}

async function reactivate(actorId, userId, ip) {
  await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [userId]);
  await adminAuditService.log(actorId, 'user.reactivate', {
    targetType: 'user', targetId: userId,
    description: 'Usuário reativado', ip,
  });
}

async function resetAccess(actorId, userId, ip) {
  await adminAuditService.log(actorId, 'user.reset_access', {
    targetType: 'user', targetId: userId,
    description: 'Fluxo de reset de acesso disparado', ip,
  });
  // TODO: enviar email de reset via mailer
}

async function hardDelete(actorId, userId, reason, ip) {
  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [userId]);
  await adminAuditService.log(actorId, 'user.hard_delete', {
    targetType: 'user', targetId: userId,
    description: `Hard delete. Motivo: ${reason}`, ip,
  });
}

async function update(actorId, userId, changes, ip) {
  const allowed = ['name', 'email'];
  const fields = Object.entries(changes).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE users SET ${sets} WHERE id = ?`, [...fields.map(([, v]) => v), userId]);
  await adminAuditService.log(actorId, 'user.update', {
    targetType: 'user', targetId: userId,
    description: 'Dados básicos do usuário atualizados', metadata: changes, ip,
  });
}

module.exports = { list, findById, suspend, reactivate, resetAccess, hardDelete, update };
