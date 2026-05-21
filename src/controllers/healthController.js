const healthService       = require('../services/healthService');
const vaccineService      = require('../services/vaccineService');
const notificationService = require('../services/notificationService');

function sanitizeEntry(e) {
  return {
    id:           e.id,
    childId:      e.child_id,
    type:         e.type,
    date:         e.entry_date,
    title:        e.title,
    description:  e.notes ?? null,
    doctor:       e.doctor ?? null,
    clinic:       e.clinic ?? null,
    nextDate:     e.next_date ?? null,
    registeredBy: e.created_by_id,
    createdAt:    e.created_at,
  };
}

async function listEntries(req, res, next) {
  try {
    const { childId, ...filters } = req.query;
    if (!childId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'childId é obrigatório.' } });
    const entries = await healthService.listByChild(childId, req.connectionId, filters);
    res.json({ success: true, data: entries.map(sanitizeEntry) });
  } catch (err) { next(err); }
}

async function createEntry(req, res, next) {
  try {
    const entry = await healthService.create(req.body.childId, req.connectionId, req.userId, req.body);
    await notificationService.notifyCoparent(req.connectionId, req.userId, 'health', {});
    res.status(201).json({ success: true, data: sanitizeEntry(entry) });
  } catch (err) { next(err); }
}

async function getEntry(req, res, next) {
  try {
    const entry = await healthService.findById(req.params.entryId, null, req.connectionId);
    if (!entry) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' } });
    res.json({ success: true, data: sanitizeEntry(entry) });
  } catch (err) { next(err); }
}

async function updateEntry(req, res, next) {
  try {
    await healthService.update(req.params.entryId, null, req.body);
    const entry = await healthService.findById(req.params.entryId, null, req.connectionId);
    res.json({ success: true, data: sanitizeEntry(entry) });
  } catch (err) { next(err); }
}

async function deleteEntry(req, res, next) {
  try {
    await healthService.softDelete(req.params.entryId, null);
    res.json({ success: true, data: { message: 'Registro removido.' } });
  } catch (err) { next(err); }
}

async function getVaccineCard(req, res, next) {
  try {
    const card = await vaccineService.getCardWithStatus(req.params.childId, req.connectionId);
    res.json({ success: true, data: card });
  } catch (err) { next(err); }
}

async function logDose(req, res, next) {
  try {
    const dose = await vaccineService.logDose(null, req.connectionId, req.userId, { vaccineId: req.params.vaccineId, ...req.body });
    res.status(201).json({ success: true, data: dose });
  } catch (err) { next(err); }
}

module.exports = { listEntries, createEntry, getEntry, updateEntry, deleteEntry, getVaccineCard, logDose };
