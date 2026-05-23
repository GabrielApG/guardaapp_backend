const svc = require('../services/adminAuthService');

async function login(req, res, next) {
  try {
    const { email, password, totp } = req.body;
    const result = await svc.login(email, password, totp, req.ip, req.headers['user-agent']);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    res.json({ success: true, data: await svc.refresh(req.body.refreshToken, req.ip) });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    await svc.logout(req.body.refreshToken, req.adminId, req.ip);
    res.json({ success: true, data: { message: 'Sessão encerrada.' } });
  } catch (err) { next(err); }
}

async function setupMfa(req, res, next) {
  try { res.json({ success: true, data: await svc.setupMfa(req.adminId) }); }
  catch (err) { next(err); }
}

async function verifyMfa(req, res, next) {
  try { res.json({ success: true, data: await svc.verifyMfaSetup(req.adminId, req.body.totp) }); }
  catch (err) { next(err); }
}

async function listAdmins(req, res, next) {
  try { res.json({ success: true, data: await svc.listAdmins() }); }
  catch (err) { next(err); }
}

async function createAdmin(req, res, next) {
  try {
    const result = await svc.createAdmin(req.adminId, req.body, req.ip);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function updateAdmin(req, res, next) {
  try {
    await svc.updateAdmin(req.adminId, req.params.id, req.body, req.ip);
    res.json({ success: true, data: { updated: true } });
  } catch (err) { next(err); }
}

async function deleteAdmin(req, res, next) {
  try {
    await svc.deleteAdmin(req.adminId, req.params.id, req.ip);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
}

module.exports = { login, refresh, logout, setupMfa, verifyMfa, listAdmins, createAdmin, updateAdmin, deleteAdmin };
