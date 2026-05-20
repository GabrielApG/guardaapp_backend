const childService = require('../services/childService');
const storage      = require('../services/storage');

async function listChildren(req, res, next) {
  try {
    const children = await childService.listByConnection(req.connectionId);
    res.json({ success: true, data: children });
  } catch (err) { next(err); }
}

async function createChild(req, res, next) {
  try {
    const child = await childService.create(req.connectionId, req.body);
    res.status(201).json({ success: true, data: child });
  } catch (err) { next(err); }
}

async function getChild(req, res, next) {
  try {
    const child = await childService.findById(req.params.childId, req.connectionId);
    if (!child) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Filho não encontrado.' } });
    res.json({ success: true, data: child });
  } catch (err) { next(err); }
}

async function updateChild(req, res, next) {
  try {
    await childService.update(req.params.childId, req.connectionId, req.body);
    const child = await childService.findById(req.params.childId, req.connectionId);
    res.json({ success: true, data: child });
  } catch (err) { next(err); }
}

async function deleteChild(req, res, next) {
  try {
    await childService.softDelete(req.params.childId, req.connectionId);
    res.json({ success: true, data: { message: 'Filho removido.' } });
  } catch (err) { next(err); }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const url = await storage.uploadAvatar(req.file, `child-${req.params.childId}`);
    await childService.updateAvatarUrl(req.params.childId, req.connectionId, url);
    res.json({ success: true, data: { avatarUrl: url } });
  } catch (err) { next(err); }
}

module.exports = { listChildren, createChild, getChild, updateChild, deleteChild, uploadAvatar };
