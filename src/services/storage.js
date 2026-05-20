const { client, BUCKETS } = require('../config/minio');
const { v4: uuidv4 }      = require('uuid');
const path                = require('path');

async function _upload(buffer, originalname, bucket, prefix) {
  const ext      = path.extname(originalname || '').toLowerCase();
  const key      = `${prefix}/${uuidv4()}${ext}`;
  const size     = buffer.length;
  await client.putObject(bucket, key, buffer, size);
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

async function generatePresignedUrl(key, bucket, ttlSec = 3600) {
  return client.presignedGetObject(bucket || BUCKETS.DOCUMENTS, key, ttlSec);
}

async function deleteFile(key, bucketName) {
  const bucket = BUCKETS[bucketName?.toUpperCase()] || bucketName;
  await client.removeObject(bucket, key);
}

module.exports = { uploadDocument, uploadAvatar, uploadReceipt, uploadMilestonePhoto, uploadExport, generatePresignedUrl, deleteFile };
