const db             = require('../config/database');
const hashChain      = require('./hashChain');
const { v4: uuidv4 } = require('uuid');

async function listByConnection(connectionId, filters = {}) {
  let sql    = 'SELECT ae.*, u.name AS actor_name FROM audit_events ae LEFT JOIN users u ON ae.actor_id = u.id WHERE ae.connection_id = ?';
  const params = [connectionId];
  if (filters.type)      { sql += ' AND ae.event_type = ?'; params.push(filters.type); }
  if (filters.actorId)   { sql += ' AND ae.actor_id = ?';   params.push(filters.actorId); }
  if (filters.startDate) { sql += ' AND ae.created_at >= ?'; params.push(filters.startDate); }
  if (filters.endDate)   { sql += ' AND ae.created_at <= ?'; params.push(filters.endDate); }
  sql += ' ORDER BY ae.created_at DESC LIMIT ?';
  params.push(filters.limit || 50);
  const [events]   = await db.query(sql, params);
  const [countRow] = await db.query('SELECT COUNT(*) as total FROM audit_events WHERE connection_id = ?', [connectionId]);
  return { events, total: countRow[0].total };
}

async function findById(eventId, connectionId) {
  const [rows] = await db.query(
    'SELECT ae.*, u.name AS actor_name FROM audit_events ae LEFT JOIN users u ON ae.actor_id = u.id WHERE ae.id = ? AND ae.connection_id = ?',
    [eventId, connectionId]
  );
  return rows[0] || null;
}

async function log(connectionId, actorId, eventType, description, metadata = {}) {
  const previousHash = await hashChain.getLastHash(connectionId);
  const id           = uuidv4();
  const hash         = hashChain.computeHash({ id, eventType, description, actorId, metadata, timestamp: new Date().toISOString() }, previousHash);
  await db.query(
    `INSERT INTO audit_events (id, connection_id, actor_id, event_type, description, hash, previous_hash, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, connectionId, actorId, eventType, description, hash, previousHash, JSON.stringify(metadata)]
  );
  return id;
}

async function verifyChainIntegrity(connectionId) {
  const [events] = await db.query('SELECT * FROM audit_events WHERE connection_id = ? ORDER BY created_at ASC', [connectionId]);
  let valid = true;
  let previousHash = null;
  for (const event of events) {
    const computed = hashChain.computeHash(
      { id: event.id, eventType: event.event_type, description: event.description, actorId: event.actor_id, metadata: event.metadata, timestamp: event.created_at },
      previousHash
    );
    if (computed !== event.hash) { valid = false; break; }
    previousHash = event.hash;
  }
  return { valid, eventCount: events.length };
}

async function createExportJob(connectionId, userId, dateRange) {
  const id = uuidv4();
  await db.query('INSERT INTO audit_exports (id, connection_id, requested_by_id, status) VALUES (?, ?, ?, ?)', [id, connectionId, userId, 'pending']);
  return id;
}

async function getExportJob(jobId, connectionId) {
  const [rows] = await db.query('SELECT * FROM audit_exports WHERE id = ? AND connection_id = ?', [jobId, connectionId]);
  return rows[0] || null;
}

module.exports = { listByConnection, findById, log, verifyChainIntegrity, createExportJob, getExportJob };
