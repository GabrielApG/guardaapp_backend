const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const pushService    = require('./pushService');

async function listByConnection(connectionId, filters = {}) {
  let sql  = 'SELECT * FROM events WHERE connection_id = ? AND deleted_at IS NULL';
  const params = [connectionId];
  if (filters.startDate) { sql += ' AND event_date >= ?'; params.push(filters.startDate); }
  if (filters.endDate)   { sql += ' AND event_date <= ?'; params.push(filters.endDate); }
  if (filters.childId)   { sql += ' AND child_id = ?';    params.push(filters.childId); }
  if (filters.category)  { sql += ' AND category = ?';    params.push(filters.category); }
  sql += ' ORDER BY event_date ASC';
  const [rows] = await db.query(sql, params);
  return rows;
}

async function findById(eventId, connectionId) {
  const [rows] = await db.query('SELECT * FROM events WHERE id = ? AND connection_id = ? AND deleted_at IS NULL', [eventId, connectionId]);
  return rows[0] || null;
}

async function create(connectionId, createdBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO events (id, connection_id, child_id, created_by_user_id, title, description, location, category, event_date, start_time, end_time, recurrence, recurrence_end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, connectionId, data.childId || data.child_id, createdBy, data.title, data.description || null, data.location || null, data.category, data.eventDate || data.event_date, data.startTime || data.start_time || null, data.endTime || data.end_time || null, data.recurrence || 'none', data.recurrenceEndDate || null]
  );
  const event = await findById(id, connectionId);
  // Notifica co-parente (fire-and-forget)
  pushService.notifyNewEvent(createdBy, connectionId, {
    id, title: data.title, start_date: data.eventDate || data.event_date,
  }).catch(() => {});
  return event;
}

async function update(eventId, userId, data) {
  const event = await db.query('SELECT * FROM events WHERE id = ? AND created_by_user_id = ?', [eventId, userId]);
  if (!event[0].length) {
    const err = new Error('Sem permissão para editar este evento.'); err.status = 403; err.code = 'FORBIDDEN'; throw err;
  }
  const allowed = ['title', 'description', 'location', 'category', 'event_date', 'start_time', 'end_time', 'recurrence'];
  const mapped  = { eventDate: 'event_date', startTime: 'start_time', endTime: 'end_time' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE events SET ${sets} WHERE id = ?`, [...fields.map(([, v]) => v), eventId]);
}

async function softDelete(eventId, userId) {
  await db.query('UPDATE events SET deleted_at = NOW() WHERE id = ? AND created_by_user_id = ?', [eventId, userId]);
}

async function setConfirmation(eventId, userId, status) {
  const [event] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event.length) {
    const err = new Error('Evento não encontrado.'); err.status = 404; err.code = 'NOT_FOUND'; throw err;
  }
  const ev = event[0];
  const isCreator = ev.created_by_user_id === userId;
  const field     = isCreator ? 'confirmed_by_creator' : 'confirmed_by_coparent';
  const value     = status === 'confirmed' ? 1 : 0;
  await db.query(`UPDATE events SET ${field} = ? WHERE id = ?`, [value, eventId]);
  return { status, [`${isCreator ? 'confirmedByCreator' : 'confirmedByCoparent'}`]: !!value };
}

module.exports = { listByConnection, findById, create, update, softDelete, setConfirmation };
