const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function listByConnection(connectionId) {
  const [rows] = await db.query('SELECT * FROM children WHERE connection_id = ? AND is_active = 1', [connectionId]);
  return rows;
}

async function findById(childId, connectionId) {
  const [rows] = await db.query('SELECT * FROM children WHERE id = ? AND connection_id = ? AND is_active = 1', [childId, connectionId]);
  return rows[0] || null;
}

async function create(connectionId, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO children (id, connection_id, name, birth_date, school, doctor, emoji, blood_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, connectionId, data.name, data.birthDate || data.birth_date, data.school || null, data.doctor || null, data.emoji || '👧', data.bloodType || data.blood_type || null, data.notes || null]
  );
  return findById(id, connectionId);
}

async function update(childId, connectionId, data) {
  const allowed = ['name', 'birth_date', 'school', 'doctor', 'emoji', 'blood_type', 'notes'];
  const mapped  = { birthDate: 'birth_date', bloodType: 'blood_type' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE children SET ${sets} WHERE id = ? AND connection_id = ?`, [...fields.map(([, v]) => v), childId, connectionId]);
}

async function softDelete(childId, connectionId) {
  await db.query('UPDATE children SET is_active = 0 WHERE id = ? AND connection_id = ?', [childId, connectionId]);
}

async function updateAvatarUrl(childId, connectionId, url) {
  await db.query('UPDATE children SET avatar_url = ? WHERE id = ? AND connection_id = ?', [url, childId, connectionId]);
}

module.exports = { listByConnection, findById, create, update, softDelete, updateAvatarUrl };
