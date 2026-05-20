const vaccineService      = require('../services/vaccineService');
const notificationService = require('../services/notificationService');

async function getVaccineCard(req, res, next) {
  try {
    const card = await vaccineService.getCardWithStatus(req.params.childId, req.connectionId);
    res.json({ success: true, data: card });
  } catch (err) { next(err); }
}

async function listDoses(req, res, next) {
  try {
    const doses = await vaccineService.listDosesByChild(req.params.childId, req.connectionId);
    res.json({ success: true, data: doses });
  } catch (err) { next(err); }
}

async function logDose(req, res, next) {
  try {
    const dose = await vaccineService.logDose(req.params.childId, req.connectionId, req.userId, req.body);
    await notificationService.notifyCoparent(req.connectionId, req.userId, 'vaccine', {});
    res.status(201).json({ success: true, data: dose });
  } catch (err) { next(err); }
}

async function updateDose(req, res, next) {
  try {
    await vaccineService.updateDose(req.params.doseId, req.params.childId, req.body);
    res.json({ success: true, data: { message: 'Dose atualizada.' } });
  } catch (err) { next(err); }
}

async function deleteDose(req, res, next) {
  try {
    await vaccineService.softDelete(req.params.doseId, req.params.childId);
    res.json({ success: true, data: { message: 'Dose removida.' } });
  } catch (err) { next(err); }
}

async function getPendingVaccines(req, res, next) {
  try {
    const pending = await vaccineService.getPendingByAge(req.params.childId, req.connectionId);
    res.json({ success: true, data: pending });
  } catch (err) { next(err); }
}

module.exports = { getVaccineCard, listDoses, logDose, updateDose, deleteDose, getPendingVaccines };
