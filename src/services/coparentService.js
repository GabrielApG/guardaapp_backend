const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function createInvite(userId, inviteEmail) {
  const code = `GUARDA-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const id   = uuidv4();
  await db.query(
    `INSERT INTO coparent_connections (id, user_id_a, user_id_b, invite_code, invite_email) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, userId, code, inviteEmail]
  );
  return { id, invite_code: code };
}

async function acceptByCode(userId, code) {
  const [rows] = await db.query(`SELECT * FROM coparent_connections WHERE invite_code = ? AND status = 'pending'`, [code]);
  if (!rows.length) {
    const err = new Error('Código inválido ou expirado.'); err.status = 404; err.code = 'NOT_FOUND'; throw err;
  }
  const connection = rows[0];
  if (connection.user_id_a === userId) {
    const err = new Error('Você não pode aceitar seu próprio convite.'); err.status = 409; err.code = 'CONFLICT'; throw err;
  }
  await db.query(`UPDATE coparent_connections SET user_id_b = ?, status = 'active', accepted_at = NOW() WHERE id = ?`, [userId, connection.id]);
  return { ...connection, user_id_b: userId, status: 'active' };
}

async function getConnectionForUser(userId) {
  const [rows] = await db.query(
    `SELECT * FROM coparent_connections WHERE (user_id_a = ? OR user_id_b = ?) AND status = 'active'`,
    [userId, userId]
  );
  return rows[0] || null;
}

async function getConnectionById(connectionId) {
  const [rows] = await db.query('SELECT * FROM coparent_connections WHERE id = ?', [connectionId]);
  return rows[0] || null;
}

async function setProtectiveOrder(connectionId, enabled) {
  await db.query('UPDATE coparent_connections SET protective_order = ? WHERE id = ?', [enabled ? 1 : 0, connectionId]);
}

async function terminate(connectionId, userId, reason) {
  await db.query(
    `UPDATE coparent_connections SET status = 'terminated', terminated_at = NOW(), terminated_reason = ? WHERE id = ?`,
    [reason || null, connectionId]
  );
}

async function validateMembership(connectionId, userId) {
  const [rows] = await db.query('SELECT id FROM coparent_connections WHERE id = ? AND (user_id_a = ? OR user_id_b = ?)', [connectionId, userId, userId]);
  return rows.length > 0;
}

module.exports = { createInvite, acceptByCode, getConnectionForUser, getConnectionById, setProtectiveOrder, terminate, validateMembership };
