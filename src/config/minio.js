const Minio = require('minio');

const client = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKETS = {
  DOCUMENTS:  process.env.MINIO_BUCKET_DOCUMENTS  || 'guardaapp-docs',
  AVATARS:    process.env.MINIO_BUCKET_AVATARS    || 'guardaapp-avatars',
  RECEIPTS:   process.env.MINIO_BUCKET_RECEIPTS   || 'guardaapp-receipts',
  MILESTONES: process.env.MINIO_BUCKET_MILESTONES || 'guardaapp-milestones',
  EXPORTS:    process.env.MINIO_BUCKET_EXPORTS    || 'guardaapp-exports',
};

module.exports = { client, BUCKETS };
