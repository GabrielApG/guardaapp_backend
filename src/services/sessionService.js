const db             = require('../config/database');
const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createSession(userId, deviceInfo, refreshToken) {
  const id   = uuidv4();
  const hash = await bcrypt.hash(refreshToken, 10);
  const exp  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO user_sessions (id, user_id, refresh_token_hash, device_name, device_os, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, hash, deviceInfo.deviceName || null, deviceInfo.deviceOs || null, deviceInfo.ipAddress || null, exp]
  );
  return { id };
}

async function findByRefreshToken(token) {
  const [rows] = await db.query(
    `SELECT * FROM user_sessions WHERE revoked_at IS NULL AND expires_at > NOW()`,
    []
  );
  for (const session of rows) {
    const match = await bcrypt.compare(token, session.refresh_token_hash);
    if (match) return session;
  }
  return null;
}

async function rotateRefreshToken(sessionId, newToken) {
  const hash = await bcrypt.hash(newToken, 10);
  await db.query('UPDATE user_sessions SET refresh_token_hash = ?, last_seen_at = NOW() WHERE id = ?', [hash, sessionId]);
}

async function listActiveByUser(userId) {
  const [rows] = await db.query(
    `SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC`,
    [userId]
  );
  return rows;
}

async function revokeById(sessionId, userId) {
  await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ?', [sessionId, userId]);
}

async function revokeSession(sessionId, userId) {
  return revokeById(sessionId, userId);
}

async function revokeAllSessions(userId, exceptSessionId) {
  if (exceptSessionId) {
    await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND id != ? AND revoked_at IS NULL', [userId, exceptSessionId]);
  } else {
    await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  }
}

module.exports = { createSession, findByRefreshToken, rotateRefreshToken, listActiveByUser, revokeById, revokeSession, revokeAllSessions };
