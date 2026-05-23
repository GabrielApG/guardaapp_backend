const db = require('../../config/database');

async function list(filters = {}) {
  let sql = `SELECT cc.id, cc.status, cc.protective_order, cc.created_at,
    u1.name as user1_name, u1.email as user1_email,
    u2.name as user2_name, u2.email as user2_email,
    (SELECT COUNT(*) FROM children WHERE connection_id = cc.id) as children_count
    FROM coparent_connections cc
    LEFT JOIN users u1 ON cc.user_id_a = u1.id
    LEFT JOIN users u2 ON cc.user_id_b = u2.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND cc.status = ?'; params.push(filters.status); }
  const limit  = parseInt(filters.limit) || 20;
  const offset = ((parseInt(filters.page) || 1) - 1) * limit;
  sql += ' ORDER BY cc.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [connections] = await db.query(sql, params);
  const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM coparent_connections');
  return { connections, total };
}

async function findById(connectionId) {
  const [rows] = await db.query(
    `SELECT cc.id, cc.status, cc.protective_order, cc.created_at,
     u1.name as user1_name, u1.email as user1_email,
     u2.name as user2_name, u2.email as user2_email,
     (SELECT COUNT(*) FROM children WHERE connection_id = cc.id) as children_count,
     (SELECT COUNT(*) FROM messages WHERE connection_id = cc.id) as messages_count,
     (SELECT COUNT(*) FROM expenses WHERE connection_id = cc.id AND deleted_at IS NULL) as expenses_count,
     (SELECT COUNT(*) FROM moderation_flags WHERE connection_id = cc.id AND status = 'pendente') as pending_flags
     FROM coparent_connections cc
     LEFT JOIN users u1 ON cc.user_id_a = u1.id
     LEFT JOIN users u2 ON cc.user_id_b = u2.id
     WHERE cc.id = ?`,
    [connectionId]
  );
  return rows[0] || null;
}

module.exports = { list, findById };
