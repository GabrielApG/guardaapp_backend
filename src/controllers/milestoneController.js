const milestoneService    = require('../services/milestoneService');
const storage             = require('../services/storage');
const notificationService = require('../services/notificationService');
const db                  = require('../config/database');
const { v4: uuidv4 }      = require('uuid');
const { BUCKETS }         = require('../config/minio');

const PHOTO_TTL = 3600; // 1 hora

async function resolvePhotoUrl(key) {
  if (!key) return null;
  try { return await storage.generatePresignedUrl(key, BUCKETS.MILESTONES, PHOTO_TTL); }
  catch (_) { return null; }
}

async function sanitizeMilestone(m) {
  return {
    id:          m.id,
    childId:     m.child_id,
    title:       m.title,
    description: m.description ?? null,
    date:        m.milestone_date,
    emoji:       m.emoji ?? '🎉',
    category:    m.category ?? 'other',
    photoUrl:    await resolvePhotoUrl(m.photo_minio_key),
    createdAt:   m.created_at,
    // photo_minio_key nunca exposta ao cliente
  };
}

async function listMilestones(req, res, next) {
  try {
    const { childId, page = 1, perPage = 20, cursor } = req.query;
    if (!childId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'childId é obrigatório.' } });
    const { milestones, total } = await milestoneService.listByChild(childId, req.connectionId, cursor, parseInt(perPage));
    const data = await Promise.all(milestones.map(sanitizeMilestone));
    res.json({ success: true, data, meta: { page: +page, perPage: +perPage, total } });
  } catch (err) { next(err); }
}

async function createMilestone(req, res, next) {
  try {
    let photoKey = null;
    if (req.file) photoKey = await storage.uploadMilestonePhoto(req.file, Date.now().toString());
    const milestone = await milestoneService.create(req.body.childId, req.connectionId, req.userId, { ...req.body, photoKey });
    await notificationService.notifyCoparent(req.connectionId, req.userId, 'milestone', {});
    res.status(201).json({ success: true, data: await sanitizeMilestone(milestone) });
  } catch (err) { next(err); }
}

async function getMilestone(req, res, next) {
  try {
    const milestone = await milestoneService.findById(req.params.milestoneId, null, req.connectionId);
    if (!milestone) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Marco não encontrado.' } });
    res.json({ success: true, data: await sanitizeMilestone(milestone) });
  } catch (err) { next(err); }
}

async function updateMilestone(req, res, next) {
  try {
    await milestoneService.update(req.params.milestoneId, req.userId, req.body);
    const milestone = await milestoneService.findById(req.params.milestoneId, null, req.connectionId);
    res.json({ success: true, data: await sanitizeMilestone(milestone) });
  } catch (err) { next(err); }
}

async function deleteMilestone(req, res, next) {
  try {
    await milestoneService.softDelete(req.params.milestoneId, req.userId);
    res.json({ success: true, data: { message: 'Marco removido.' } });
  } catch (err) { next(err); }
}

async function addPhoto(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key   = await storage.uploadMilestonePhoto(req.file, req.params.milestoneId);
    const photo = await milestoneService.attachPhoto(req.params.milestoneId, key, req.body.caption);
    const url   = await resolvePhotoUrl(photo.storage_key);
    res.status(201).json({ success: true, data: { id: photo.id, url, caption: photo.caption } });
  } catch (err) { next(err); }
}

async function deletePhoto(req, res, next) {
  try {
    await milestoneService.removePhoto(req.params.photoId, req.params.milestoneId);
    res.json({ success: true, data: { message: 'Foto removida.' } });
  } catch (err) { next(err); }
}

async function addComment(req, res, next) {
  try {
    const { text } = req.body;
    const id = uuidv4();
    await db.query('INSERT INTO milestone_comments (id, milestone_id, author_id, text) VALUES (?, ?, ?, ?)', [id, req.params.milestoneId, req.userId, text]);
    res.status(201).json({ success: true, data: { id, text, createdAt: new Date() } });
  } catch (err) { next(err); }
}

module.exports = { listMilestones, createMilestone, getMilestone, updateMilestone, deleteMilestone, addPhoto, deletePhoto, addComment };
