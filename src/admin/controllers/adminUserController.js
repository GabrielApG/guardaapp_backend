const svc   = require('../services/adminUserService');
const audit = require('../services/adminAuditService');

async function listUsers(req, res, next) {
  try {
    const { users, total } = await svc.list(req.query);
    res.json({ success: true, data: { users, total } });
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    await audit.log(req.adminId, 'user.view', { targetType: 'user', targetId: req.params.id, description: 'Metadados de usuário visualizados', ip: req.ip });
    const user = await svc.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Usuário não encontrado.' } });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    await svc.update(req.adminId, req.params.id, req.body, req.ip);
    res.json({ success: true, data: { updated: true } });
  } catch (err) { next(err); }
}

async function suspendUser(req, res, next) {
  try {
    await svc.suspend(req.adminId, req.params.id, req.body.reason, req.ip);
    res.json({ success: true, data: { suspended: true } });
  } catch (err) { next(err); }
}

async function reactivateUser(req, res, next) {
  try {
    await svc.reactivate(req.adminId, req.params.id, req.ip);
    res.json({ success: true, data: { reactivated: true } });
  } catch (err) { next(err); }
}

async function resetAccess(req, res, next) {
  try {
    await svc.resetAccess(req.adminId, req.params.id, req.ip);
    res.json({ success: true, data: { resetDispatched: true } });
  } catch (err) { next(err); }
}

async function hardDeleteUser(req, res, next) {
  try {
    if (!req.body.reason) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo obrigatório para hard delete.' } });
    await svc.hardDelete(req.adminId, req.params.id, req.body.reason, req.ip);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
}

module.exports = { listUsers, getUser, updateUser, suspendUser, reactivateUser, resetAccess, hardDeleteUser };
