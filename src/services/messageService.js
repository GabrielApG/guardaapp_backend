const db             = require('../config/database');
const hashChain      = require('./hashChain');
const { v4: uuidv4 } = require('uuid');

async function listByConnection(connectionId, before, limit = 30) {
  let sql    = 'SELECT * FROM messages WHERE conversation_id = (SELECT id FROM conversations WHERE connection_id = ?) AND deleted_at IS NULL';
  const params = [connectionId];
  if (before) { sql += ' AND id < ?'; params.push(before); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const [messages] = await db.query(sql, params);
  const [countRow] = await db.query('SELECT COUNT(*) as total FROM messages WHERE conversation_id = (SELECT id FROM conversations WHERE connection_id = ?) AND deleted_at IS NULL', [connectionId]);
  return { messages: messages.reverse(), total: countRow[0].total };
}

async function findById(messageId, connectionId) {
  const [rows] = await db.query(
    `SELECT m.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.id = ? AND c.connection_id = ?`,
    [messageId, connectionId]
  );
  return rows[0] || null;
}

async function ensureConversation(connectionId) {
  const [rows] = await db.query('SELECT id FROM conversations WHERE connection_id = ?', [connectionId]);
  if (rows.length) return rows[0].id;
  const id = uuidv4();
  await db.query('INSERT INTO conversations (id, connection_id) VALUES (?, ?)', [id, connectionId]);
  return id;
}

async function create(connectionId, senderId, text, isForced = false) {
  const convId       = await ensureConversation(connectionId);
  const previousHash = await hashChain.getLastHash(connectionId);
  const id           = uuidv4();
  const hash         = hashChain.computeHash({ id, text, senderId, timestamp: new Date().toISOString() }, previousHash);
  await db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, text, hash, previous_hash, is_hostile) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, convId, senderId, text, hash, previousHash, isForced ? 1 : 0]
  );
  return { id, text, hash, isFlaggedHostile: isForced, createdAt: new Date() };
}

async function markForcedSend(messageId, connectionId) {
  await db.query('UPDATE messages SET is_hostile = 1 WHERE id = ?', [messageId]);
  return findById(messageId, connectionId);
}

async function listAll(connectionId) {
  const [rows] = await db.query(
    `SELECT m.* FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.connection_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at ASC`,
    [connectionId]
  );
  return rows;
}

async function markRead(connectionId, userId) {
  await db.query(
    `UPDATE messages SET read_at = NOW() WHERE conversation_id = (SELECT id FROM conversations WHERE connection_id = ?) AND sender_id != ? AND read_at IS NULL`,
    [connectionId, userId]
  );
}

module.exports = { listByConnection, findById, create, markForcedSend, listAll, markRead };
