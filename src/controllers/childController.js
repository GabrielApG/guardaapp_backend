const childService   = require('../services/childService');
const storage        = require('../services/storage');
const { BUCKETS }    = require('../config/minio');

const AVATAR_TTL = 24 * 3600; // 24 horas

async function resolveChildAvatarUrl(key) {
  if (!key) return null;
  try { return await storage.generatePresignedUrl(key, BUCKETS.AVATARS, AVATAR_TTL); }
  catch (_) { return null; }
}

async function sanitizeChild(c) {
  return {
    id:         c.id,
    name:       c.name,
    birthDate:  c.birth_date,
    gender:     c.gender ?? null,
    bloodType:  c.blood_type ?? null,
    avatarUrl:  await resolveChildAvatarUrl(c.avatar_url),
    emoji:      c.emoji ?? '👶',
    school:     c.school ?? null,
    doctor:     c.doctor ?? null,
    notes:      c.notes ?? null,
    createdAt:  c.created_at,
  };
}

async function listChildren(req, res, next) {
  try {
    const children = await childService.listByConnection(req.connectionId);
    const data = await Promise.all(children.map(sanitizeChild));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function createChild(req, res, next) {
  try {
    const child = await childService.create(req.connectionId, req.body);
    res.status(201).json({ success: true, data: await sanitizeChild(child) });
  } catch (err) { next(err); }
}

async function getChild(req, res, next) {
  try {
    const child = await childService.findById(req.params.childId, req.connectionId);
    if (!child) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Filho não encontrado.' } });
    res.json({ success: true, data: await sanitizeChild(child) });
  } catch (err) { next(err); }
}

async function updateChild(req, res, next) {
  try {
    await childService.update(req.params.childId, req.connectionId, req.body);
    const child = await childService.findById(req.params.childId, req.connectionId);
    res.json({ success: true, data: await sanitizeChild(child) });
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
    const key = await storage.uploadAvatar(req.file, `child-${req.params.childId}`);
    await childService.updateAvatarUrl(req.params.childId, req.connectionId, key);
    const avatarUrl = await resolveChildAvatarUrl(key);
    res.json({ success: true, data: { avatarUrl } });
  } catch (err) { next(err); }
}

module.exports = { listChildren, createChild, getChild, updateChild, deleteChild, uploadAvatar };
