const crypto = require('crypto');
const db     = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

async function getLastAdminHash() {
  const [rows] = await db.query('SELECT hash FROM admin_audit_events ORDER BY created_at DESC LIMIT 1');
  return rows.length ? rows[0].hash : null;
}

function computeHash(data, previousHash) {
  const payload = JSON.stringify(data) + (previousHash || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function log(adminId, action, { targetType, targetId, description, metadata, ip } = {}) {
  const previousHash = await getLastAdminHash();
  const id = uuidv4();
  const hash = computeHash(
    { id, adminId, action, targetType, targetId, description, metadata, timestamp: new Date().toISOString() },
    previousHash
  );
  await db.query(
    `INSERT INTO admin_audit_events (id, admin_id, action, target_type, target_id, description, metadata, ip, previous_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, adminId, action, targetType || null, targetId || null, description, JSON.stringify(metadata || {}), ip || null, previousHash, hash]
  );
  return id;
}

async function list(filters = {}) {
  let sql = 'SELECT ae.*, au.name AS admin_name FROM admin_audit_events ae LEFT JOIN admin_users au ON ae.admin_id = au.id WHERE 1=1';
  const params = [];
  if (filters.adminId) { sql += ' AND ae.admin_id = ?'; params.push(filters.adminId); }
  if (filters.action)  { sql += ' AND ae.action = ?';   params.push(filters.action); }
  if (filters.from)    { sql += ' AND ae.created_at >= ?'; params.push(filters.from); }
  if (filters.to)      { sql += ' AND ae.created_at <= ?'; params.push(filters.to); }
  sql += ' ORDER BY ae.created_at DESC LIMIT ? OFFSET ?';
  const limit  = parseInt(filters.limit)  || 50;
  const offset = parseInt(filters.offset) || 0;
  params.push(limit, offset);
  const [events] = await db.query(sql, params);
  const [countRow] = await db.query('SELECT COUNT(*) as total FROM admin_audit_events');
  return { events, total: countRow[0].total };
}

async function verifyChainIntegrity() {
  const [events] = await db.query('SELECT * FROM admin_audit_events ORDER BY created_at ASC');
  let valid = true;
  let previousHash = null;
  for (const event of events) {
    const computed = computeHash(
      { id: event.id, adminId: event.admin_id, action: event.action, targetType: event.target_type, targetId: event.target_id, description: event.description, metadata: event.metadata, timestamp: event.created_at },
      previousHash
    );
    if (computed !== event.hash) { valid = false; break; }
    previousHash = event.hash;
  }
  return { valid, eventCount: events.length };
}

module.exports = { log, list, verifyChainIntegrity };
