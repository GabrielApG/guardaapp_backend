const crypto = require('crypto');
const db     = require('../config/database');

function computeHash(eventData, previousHash) {
  const payload = JSON.stringify(eventData) + (previousHash || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function getLastHash(connectionId) {
  if (!connectionId) return null;
  const [rows] = await db.query(
    'SELECT hash FROM audit_events WHERE connection_id = ? ORDER BY created_at DESC LIMIT 1',
    [connectionId]
  );
  return rows.length ? rows[0].hash : null;
}

function verifyHash(eventData, storedHash, previousHash) {
  const computed = computeHash(eventData, previousHash);
  return computed === storedHash;
}

module.exports = { computeHash, getLastHash, verifyHash };
