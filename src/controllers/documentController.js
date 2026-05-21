const documentService    = require('../services/documentService');
const storage            = require('../services/storage');
const { BUCKETS }        = require('../config/minio');
const crypto             = require('crypto');

function sanitizeDoc(doc) {
  return {
    id:           doc.id,
    title:        doc.name,
    category:     doc.category,
    notes:        doc.description ?? null,
    uploadedById: doc.uploaded_by_id,
    fileSize:     doc.size_bytes ?? null,
    fileType:     doc.file_type,
    mimeType:     doc.mime_type ?? (doc.file_type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    createdAt:    doc.created_at,
    childId:      doc.child_id ?? null,
    // minio_key nunca é exposta ao cliente
  };
}

function sanitizeAccessLog(rows) {
  return (rows ?? []).map(r => ({
    userId:     r.user_id,
    userName:   r.user_name,
    accessedAt: r.accessed_at,
  }));
}

function inlineHeaders(fileType, mimeType) {
  const contentType = mimeType ?? (fileType === 'pdf' ? 'application/pdf' : 'image/jpeg');
  return {
    'response-content-disposition': 'inline',
    'response-content-type': contentType,
  };
}

async function listDocuments(req, res, next) {
  try {
    const docs = await documentService.listByConnection(req.connectionId, req.query);
    res.json({ success: true, data: docs.map(sanitizeDoc) });
  } catch (err) { next(err); }
}

async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
    const key      = await storage.uploadDocument(req.file, req.connectionId, Date.now().toString());
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const doc      = await documentService.create(req.connectionId, req.userId, { name: req.body.title, description: req.body.notes, category: req.body.category, sizeBytes: req.file.size, fileType: req.file.mimetype.includes('pdf') ? 'pdf' : 'image', checksum }, key);
    res.status(201).json({ success: true, data: sanitizeDoc(doc) });
  } catch (err) { next(err); }
}

async function getDocument(req, res, next) {
  try {
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' } });
    await documentService.logAccess(req.params.docId, req.userId);
    const downloadUrl = await storage.generatePresignedUrl(doc.minio_key, BUCKETS.DOCUMENTS, 3600, inlineHeaders(doc.file_type, doc.mime_type));
    const accessLog   = sanitizeAccessLog(await documentService.getAccessLog(req.params.docId, req.connectionId));
    res.json({ success: true, data: { ...sanitizeDoc(doc), downloadUrl, accessLog } });
  } catch (err) { next(err); }
}

async function getPresignedUrl(req, res, next) {
  try {
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' } });
    const url = await storage.generatePresignedUrl(doc.minio_key, BUCKETS.DOCUMENTS, 3600, inlineHeaders(doc.file_type, doc.mime_type));
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
}

async function updateDocument(req, res, next) {
  try {
    await documentService.update(req.params.docId, req.userId, req.body);
    const doc = await documentService.findById(req.params.docId, req.connectionId);
    res.json({ success: true, data: sanitizeDoc(doc) });
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
    const log = sanitizeAccessLog(await documentService.getAccessLog(req.params.docId, req.connectionId));
    res.json({ success: true, data: log });
  } catch (err) { next(err); }
}

module.exports = { listDocuments, uploadDocument, getDocument, getPresignedUrl, updateDocument, deleteDocument, getAccessLog };
