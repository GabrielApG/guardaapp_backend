const db = require('../../config/database');
const adminAuditService = require('./adminAuditService');

async function list(filters = {}) {
  let sql = `SELECT t.*, u.name as user_name, u.email as user_email, au.name as assignee_name
    FROM support_tickets t
    LEFT JOIN users u       ON t.user_id = u.id
    LEFT JOIN admin_users au ON t.assigned_to_id = au.id WHERE 1=1`;
  const params = [];
  if (filters.status)   { sql += ' AND t.status = ?';          params.push(filters.status); }
  if (filters.priority) { sql += ' AND t.priority = ?';        params.push(filters.priority); }
  if (filters.assignee) { sql += ' AND t.assigned_to_id = ?';  params.push(filters.assignee); }
  const limit  = parseInt(filters.limit) || 20;
  const offset = ((parseInt(filters.page) || 1) - 1) * limit;
  sql += ' ORDER BY t.updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const [tickets]    = await db.query(sql, params);
  const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM support_tickets');
  return { tickets, total };
}

async function findById(ticketId) {
  const [rows] = await db.query(
    `SELECT t.*, u.name as user_name, u.email as user_email, au.name as assignee_name
     FROM support_tickets t
     LEFT JOIN users u        ON t.user_id = u.id
     LEFT JOIN admin_users au ON t.assigned_to_id = au.id
     WHERE t.id = ?`,
    [ticketId]
  );
  return rows[0] || null;
}

async function assign(actorId, ticketId, adminId, ip) {
  await db.query("UPDATE support_tickets SET assigned_to_id = ?, status = 'em_andamento', updated_at = NOW() WHERE id = ?", [adminId, ticketId]);
  await adminAuditService.log(actorId, 'ticket.assign', { targetType: 'ticket', targetId: ticketId, description: `Ticket atribuído ao admin ${adminId}`, ip });
}

async function reply(actorId, ticketId, body, ip) {
  await adminAuditService.log(actorId, 'ticket.reply', { targetType: 'ticket', targetId: ticketId, description: `Resposta registrada no ticket`, ip });
}

async function updateTicket(actorId, ticketId, changes, ip) {
  const allowed = ['status', 'priority'];
  const fields  = Object.entries(changes).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE support_tickets SET ${sets}, updated_at = NOW() WHERE id = ?`, [...fields.map(([, v]) => v), ticketId]);
  await adminAuditService.log(actorId, 'ticket.update', { targetType: 'ticket', targetId: ticketId, description: 'Ticket atualizado', metadata: changes, ip });
}

module.exports = { list, findById, assign, reply, updateTicket };
