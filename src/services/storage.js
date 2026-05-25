const { client, publicClient, BUCKETS } = require('../config/minio');
const { v4: uuidv4 }      = require('uuid');
const path                = require('path');

// Mapeamento de extensão → Content-Type (sem dependências externas)
const MIME_MAP = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function _contentType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

async function _upload(buffer, originalname, bucket, prefix) {
  const ext         = path.extname(originalname || '').toLowerCase();
  const key         = `${prefix}/${uuidv4()}${ext}`;
  const size        = buffer.length;
  const contentType = _contentType(originalname);
  await client.putObject(bucket, key, buffer, size, { 'Content-Type': contentType });
  return key;
}

async function uploadDocument(file, connectionId, docId) {
  return _upload(file.buffer, file.originalname, BUCKETS.DOCUMENTS, `${connectionId}/${docId}`);
}

async function uploadAvatar(file, userId) {
  return _upload(file.buffer, file.originalname, BUCKETS.AVATARS, userId);
}

async function uploadReceipt(file, expenseId) {
  return _upload(file.buffer, file.originalname, BUCKETS.RECEIPTS, expenseId);
}

async function uploadMilestonePhoto(file, milestoneId) {
  return _upload(file.buffer, file.originalname, BUCKETS.MILESTONES, milestoneId);
}

async function uploadExport(buffer, filename) {
  await client.putObject(BUCKETS.EXPORTS, filename, buffer, buffer.length);
  return generatePresignedUrl(filename, BUCKETS.EXPORTS, 24 * 3600);
}

async function generatePresignedUrl(key, bucket, ttlSec = 3600, respHeaders = {}) {
  return publicClient.presignedGetObject(bucket || BUCKETS.DOCUMENTS, key, ttlSec, respHeaders);
}

async function deleteFile(key, bucketName) {
  const bucket = BUCKETS[bucketName?.toUpperCase()] || bucketName;
  await client.removeObject(bucket, key);
}

module.exports = { uploadDocument, uploadAvatar, uploadReceipt, uploadMilestonePhoto, uploadExport, generatePresignedUrl, deleteFile };
