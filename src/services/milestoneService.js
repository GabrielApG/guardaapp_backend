const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// childId é opcional: quando omitido retorna todos os marcos da conexão (usado pelo diário)
async function listByChild(childId, connectionId, cursor, limit = 20) {
  let sql    = 'SELECT * FROM milestones WHERE connection_id = ? AND is_active = 1';
  const params = [connectionId];
  if (childId) { sql += ' AND child_id = ?'; params.push(childId); }
  if (cursor)  { sql += ' AND id < ?';       params.push(cursor); }
  sql += ' ORDER BY milestone_date DESC LIMIT ?';
  params.push(limit);
  const [milestones] = await db.query(sql, params);

  let countSql    = 'SELECT COUNT(*) as total FROM milestones WHERE connection_id = ? AND is_active = 1';
  const countParams = [connectionId];
  if (childId) { countSql += ' AND child_id = ?'; countParams.push(childId); }
  const [countRow] = await db.query(countSql, countParams);
  return { milestones, total: countRow[0].total };
}

async function findById(milestoneId, childId, connectionId) {
  const [rows] = await db.query('SELECT * FROM milestones WHERE id = ? AND connection_id = ? AND is_active = 1', [milestoneId, connectionId]);
  return rows[0] || null;
}

async function create(childId, connectionId, registeredBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO milestones (id, child_id, connection_id, created_by_id, title, description, milestone_date, emoji, photo_minio_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, childId, connectionId, registeredBy, data.title, data.description || null, data.milestoneDate || data.milestone_date, data.emoji || '🌟', data.photoKey || null]
  );
  return findById(id, childId, connectionId);
}

async function update(milestoneId, userId, data) {
  const allowed = ['title', 'description', 'milestone_date', 'emoji'];
  const mapped  = { milestoneDate: 'milestone_date' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE milestones SET ${sets} WHERE id = ? AND created_by_id = ?`, [...fields.map(([, v]) => v), milestoneId, userId]);
}

async function softDelete(milestoneId, userId) {
  await db.query('UPDATE milestones SET is_active = 0 WHERE id = ? AND created_by_id = ?', [milestoneId, userId]);
}

async function attachPhoto(milestoneId, storageKey, caption) {
  const id = uuidv4();
  await db.query('INSERT INTO milestone_photos (id, milestone_id, storage_key, caption) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE storage_key = VALUES(storage_key)', [id, milestoneId, storageKey, caption || null]);
  await db.query('UPDATE milestones SET photo_minio_key = ? WHERE id = ?', [storageKey, milestoneId]);
  return { id, storageKey, caption };
}

async function removePhoto(photoId, milestoneId) {
  await db.query('DELETE FROM milestone_photos WHERE id = ? AND milestone_id = ?', [photoId, milestoneId]);
}

module.exports = { listByChild, findById, create, update, softDelete, attachPhoto, removePhoto };
