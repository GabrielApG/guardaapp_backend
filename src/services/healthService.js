const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const TYPE_MAP = {
  consultation: 'consulta', exam: 'exame', medication: 'medicacao',
  emergency: 'consulta', other: 'consulta',
};

async function listByChild(childId, connectionId, filters = {}) {
  let sql    = 'SELECT * FROM health_entries WHERE child_id = ? AND connection_id = ? AND is_active = 1';
  const params = [childId, connectionId];
  if (filters.type) { sql += ' AND type = ?'; params.push(filters.type); }
  sql += ' ORDER BY entry_date DESC LIMIT ?';
  params.push(parseInt(filters.limit) || 50);
  const [rows] = await db.query(sql, params);
  return rows;
}

async function findById(entryId, childId, connectionId) {
  let sql    = 'SELECT * FROM health_entries WHERE id = ? AND connection_id = ? AND is_active = 1';
  const params = [entryId, connectionId];
  if (childId) { sql += ' AND child_id = ?'; params.push(childId); }
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function create(childId, connectionId, registeredBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO health_entries (id, child_id, connection_id, created_by_id, type, title, entry_date, doctor, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, childId, connectionId, registeredBy, TYPE_MAP[data.type] || data.type, data.title, data.entryDate || data.entry_date || data.date, data.doctor || null, data.notes || data.description || null]
  );
  return findById(id, childId, connectionId);
}

async function update(entryId, childId, data) {
  const allowed = ['title', 'entry_date', 'doctor', 'notes', 'type'];
  const mapped  = { entryDate: 'entry_date' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE health_entries SET ${sets} WHERE id = ?`, [...fields.map(([, v]) => v), entryId]);
}

async function softDelete(entryId) {
  await db.query('UPDATE health_entries SET is_active = 0 WHERE id = ?', [entryId]);
}

module.exports = { listByChild, findById, create, update, softDelete };
