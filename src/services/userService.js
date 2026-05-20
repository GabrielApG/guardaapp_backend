const db             = require('../config/database');
const crypto         = require('crypto');

async function findById(id) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function findByCpf(cpf) {
  const [rows] = await db.query('SELECT * FROM users WHERE cpf = ?', [cpf]);
  return rows[0] || null;
}

async function updateProfile(userId, data) {
  const allowed = ['name', 'phone', 'role', 'custody_type'];
  const fields  = Object.entries(data).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  const vals = fields.map(([, v]) => v);
  await db.query(`UPDATE users SET ${sets} WHERE id = ?`, [...vals, userId]);
}

async function updatePassword(userId, hash) {
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
}

async function updateAvatarUrl(userId, url) {
  await db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, userId]);
}

async function clearAvatarUrl(userId) {
  await db.query('UPDATE users SET avatar_url = NULL WHERE id = ?', [userId]);
}

async function markEmailVerified(userId) {
  await db.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [userId]);
}

async function setLowConflictMode(userId, enabled) {
  await db.query('UPDATE users SET low_conflict_mode = ? WHERE id = ?', [enabled ? 1 : 0, userId]);
}

async function softDelete(userId) {
  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [userId]);
}

async function anonymize(userId) {
  const hash = crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  await db.query(
    `UPDATE users SET name = ?, email = ?, cpf = ?, phone = NULL, avatar_url = NULL, deleted_at = NOW() WHERE id = ?`,
    [`Usuário Removido`, `removed_${hash}@guardaapp.invalid`, `000.000.000-00`, userId]
  );
}

module.exports = { findById, findByEmail, findByCpf, updateProfile, updatePassword, updateAvatarUrl, clearAvatarUrl, markEmailVerified, setLowConflictMode, softDelete, anonymize };
