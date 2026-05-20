const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function listConsents(userId) {
  const [rows] = await db.query('SELECT * FROM user_consents WHERE user_id = ?', [userId]);
  return rows;
}

async function updateConsent(userId, type, granted) {
  await db.query(
    `UPDATE user_consents SET granted = ?, granted_at = ?, revoked_at = ? WHERE user_id = ? AND consent_type = ?`,
    [granted ? 1 : 0, granted ? new Date() : null, granted ? null : new Date(), userId, type]
  );
  const [rows] = await db.query('SELECT * FROM user_consents WHERE user_id = ? AND consent_type = ?', [userId, type]);
  return rows[0];
}

async function createExportJob(userId) {
  const id = uuidv4();
  await db.query('INSERT INTO lgpd_export_jobs (id, user_id, status) VALUES (?, ?, ?)', [id, userId, 'pending']);
  return id;
}

async function compileUserData(userId) {
  const [user]    = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  const [sessions]= await db.query('SELECT * FROM user_sessions WHERE user_id = ?', [userId]);
  const [consents]= await db.query('SELECT * FROM user_consents WHERE user_id = ?', [userId]);
  return { user: user[0], sessions, consents };
}

async function getExportJob(jobId, userId) {
  const [rows] = await db.query('SELECT * FROM lgpd_export_jobs WHERE id = ? AND user_id = ?', [jobId, userId]);
  return rows[0] || null;
}

async function initiateAccountDeletion(userId) {
  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [userId]);
}

module.exports = { listConsents, updateConsent, createExportJob, compileUserData, getExportJob, initiateAccountDeletion };
