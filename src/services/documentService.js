const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function listByConnection(connectionId, filters = {}) {
  let sql    = 'SELECT * FROM documents WHERE connection_id = ? AND deleted_at IS NULL AND is_active = 1';
  const params = [connectionId];
  if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
  if (filters.search)   { sql += ' AND name LIKE ?';   params.push(`%${filters.search}%`); }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
}

async function findById(docId, connectionId) {
  const [rows] = await db.query('SELECT * FROM documents WHERE id = ? AND connection_id = ? AND deleted_at IS NULL', [docId, connectionId]);
  return rows[0] || null;
}

async function create(connectionId, uploadedBy, data, key) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO documents (id, connection_id, uploaded_by_id, name, description, category, file_type, minio_key, size_bytes, checksum_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, connectionId, uploadedBy, data.name, data.description || null, data.category || 'geral', data.fileType || 'pdf', key, data.sizeBytes, data.checksum]
  );
  return findById(id, connectionId);
}

async function update(docId, userId, data) {
  const allowed = ['name', 'description'];
  const fields  = Object.entries(data).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE documents SET ${sets} WHERE id = ? AND uploaded_by_id = ?`, [...fields.map(([, v]) => v), docId, userId]);
}

async function softDelete(docId, connectionId) {
  await db.query('UPDATE documents SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND connection_id = ?', [docId, connectionId]);
}

async function logAccess(docId, userId) {
  await db.query('INSERT INTO document_access_log (id, document_id, user_id) VALUES (?, ?, ?)', [uuidv4(), docId, userId]);
}

async function getAccessLog(docId, connectionId) {
  const [rows] = await db.query(
    `SELECT dal.*, u.name as user_name FROM document_access_log dal JOIN users u ON dal.user_id = u.id WHERE dal.document_id = ? ORDER BY dal.accessed_at DESC LIMIT 50`,
    [docId]
  );
  return rows;
}

module.exports = { listByConnection, findById, create, update, softDelete, logAccess, getAccessLog };
