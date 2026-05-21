const userService      = require('../services/userService');
const coparentService  = require('../services/coparentService');
const storage          = require('../services/storage');
const { BUCKETS }      = require('../config/minio');

const AVATAR_URL_TTL = 24 * 3600; // 24 horas

async function resolveAvatarUrl(key) {
  if (!key) return null;
  try {
    return await storage.generatePresignedUrl(key, BUCKETS.AVATARS, AVATAR_URL_TTL);
  } catch (_) { return null; }
}

async function sanitizeUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, cpf: u.cpf,
    phone: u.phone, role: u.role, custodyType: u.custody_type,
    avatarUrl: await resolveAvatarUrl(u.avatar_url),
    lowConflictMode: !!u.low_conflict_mode,
    emailVerified: !!u.email_verified_at, createdAt: u.created_at,
  };
}

async function getMe(req, res, next) {
  try {
    const user = await userService.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Usuário não encontrado.' } });
    res.json({ success: true, data: await sanitizeUser(user) });
  } catch (err) { next(err); }
}

async function updateMe(req, res, next) {
  try {
    await userService.updateProfile(req.userId, req.body);
    const user = await userService.findById(req.userId);
    res.json({ success: true, data: await sanitizeUser(user) });
  } catch (err) { next(err); }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key = await storage.uploadAvatar(req.file, req.userId);
    await userService.updateAvatarUrl(req.userId, key);
    const avatarUrl = await resolveAvatarUrl(key);
    res.json({ success: true, data: { avatarUrl } });
  } catch (err) { next(err); }
}

async function deleteAvatar(req, res, next) {
  try {
    const user = await userService.findById(req.userId);
    if (user.avatar_url) await storage.deleteFile(user.avatar_url, 'avatars');
    await userService.clearAvatarUrl(req.userId);
    res.json({ success: true, data: { message: 'Avatar removido.' } });
  } catch (err) { next(err); }
}

async function toggleLowConflict(req, res, next) {
  try {
    const { enabled } = req.body;
    await userService.setLowConflictMode(req.userId, !!enabled);
    res.json({ success: true, data: { lowConflictMode: !!enabled } });
  } catch (err) { next(err); }
}

async function getCoparent(req, res, next) {
  try {
    const connection = await coparentService.getConnectionForUser(req.userId);
    const coParentId = connection.user_id_a === req.userId ? connection.user_id_b : connection.user_id_a;
    const coParent   = await userService.findById(coParentId);
    res.json({ success: true, data: await sanitizeUser(coParent) });
  } catch (err) { next(err); }
}


module.exports = { getMe, updateMe, uploadAvatar, deleteAvatar, toggleLowConflict, getCoparent };
