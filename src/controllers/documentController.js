const documentService    = require('../services/documentService');
const storage            = require('../services/storage');
const { BUCKETS }        = require('../config/minio');
const crypto             = require('crypto');

async function listDocuments(req, res, next) {
  try {
    const docs = await documentService.listByConnection(req.connectionId, req.query);
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
}

async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key      = await storage.uploadDocument(req.file, req.connectionId, Date.now().toString());
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const doc      = await documentService.create(req.connectionId, req.userId, { name: req.body.title, description: req.body.notes, category: req.body.category, sizeBytes: req.file.size, fileType: req.file.mimetype.includes('pdf') ? 'pdf' : 'image', checksum }, key);
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
}

async function getDocument(req, res, next) {
  try {
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' } });
    await documentService.logAccess(req.params.docId, req.userId);
    const downloadUrl = await storage.generatePresignedUrl(doc.minio_key, BUCKETS.DOCUMENTS, 3600);
    const accessLog   = await documentService.getAccessLog(req.params.docId, req.connectionId);
    res.json({ success: true, data: { ...doc, downloadUrl, accessLog } });
  } catch (err) { next(err); }
}

async function getPresignedUrl(req, res, next) {
  try {
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' } });
    const url = await storage.generatePresignedUrl(doc.minio_key, BUCKETS.DOCUMENTS, 3600);
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
}

async function updateDocument(req, res, next) {
  try {
    await documentService.update(req.params.docId, req.userId, req.body);
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
}

async function deleteDocument(req, res, next) {
  try {
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' } });
    await storage.deleteFile(doc.minio_key, BUCKETS.DOCUMENTS);
    await documentService.softDelete(req.params.docId, req.connectionId);
    res.json({ success: true, data: { message: 'Documento excluído.' } });
  } catch (err) { next(err); }
}

async function getAccessLog(req, res, next) {
  try {
    const log = await documentService.getAccessLog(req.params.docId, req.connectionId);
    res.json({ success: true, data: log });
  } catch (err) { next(err); }
}

module.exports = { listDocuments, uploadDocument, getDocument, getPresignedUrl, updateDocument, deleteDocument, getAccessLog };
