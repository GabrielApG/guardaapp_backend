const db             = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function getCardWithStatus(childId, connectionId) {
  const [vaccines] = await db.query('SELECT * FROM vaccines WHERE child_id = ? ORDER BY name ASC', [childId]);
  const card = await Promise.all(vaccines.map(async (v) => {
    const [doses] = await db.query('SELECT * FROM vaccine_doses WHERE vaccine_id = ? ORDER BY dose_number ASC', [v.id]);
    return { ...v, doses };
  }));
  const summary = { ok: 0, pending: 0, overdue: 0, total: card.length };
  card.forEach(v => { summary[v.status] = (summary[v.status] || 0) + 1; });
  return { childId, summary, vaccines: card };
}

async function listDosesByChild(childId, connectionId) {
  const [rows] = await db.query(
    `SELECT vd.* FROM vaccine_doses vd JOIN vaccines v ON vd.vaccine_id = v.id WHERE v.child_id = ? ORDER BY vd.applied_date DESC`,
    [childId]
  );
  return rows;
}

async function logDose(childId, connectionId, registeredBy, data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO vaccine_doses (id, vaccine_id, dose_number, applied_date, applied_by, batch_number, registered_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.vaccineId, data.doseNumber, data.appliedDate, data.appliedBy || null, data.batchNumber || null, registeredBy]
  );
  await db.query('UPDATE vaccines SET doses_given = doses_given + 1 WHERE id = ?', [data.vaccineId]);
  return { id, ...data };
}

async function updateDose(doseId, childId, data) {
  const allowed = ['applied_date', 'applied_by', 'batch_number'];
  const mapped  = { appliedDate: 'applied_date', appliedBy: 'applied_by', batchNumber: 'batch_number' };
  const fields  = Object.entries(data).map(([k, v]) => [mapped[k] || k, v]).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE vaccine_doses SET ${sets} WHERE id = ?`, [...fields.map(([, v]) => v), doseId]);
}

async function softDelete(doseId) {
  await db.query('DELETE FROM vaccine_doses WHERE id = ?', [doseId]);
}

async function getPendingByAge(childId, connectionId) {
  const [child] = await db.query('SELECT birth_date FROM children WHERE id = ?', [childId]);
  if (!child.length) return [];
  const ageMonths = Math.floor((Date.now() - new Date(child[0].birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30));
  const [vaccines] = await db.query(`SELECT * FROM vaccines WHERE child_id = ? AND status != 'ok'`, [childId]);
  return vaccines;
}

module.exports = { getCardWithStatus, listDosesByChild, logDose, updateDose, softDelete, getPendingByAge };
