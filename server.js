require('dotenv').config();
const app = require('./src/app');
const { client, BUCKETS } = require('./src/config/minio');

const PORT = process.env.PORT || 3000;

// Node.js throws when a Docker-wrapped socket lacks .destroy() on aborted requests
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('socket.destroy is not a function')) return;
  console.error('[uncaughtException]', err);
  process.exit(1);
});

/**
 * Garante que todos os buckets MinIO existem antes de aceitar requisições.
 * Idempotente — usa BucketAlreadyOwnedByYou silenciosamente.
 */
async function initBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, 'us-east-1');
      console.log(`[MinIO] Bucket criado: ${bucket}`);
    }
  }
}

async function start() {
  try {
    await initBuckets();
  } catch (err) {
    console.warn('[MinIO] Aviso ao inicializar buckets:', err.message);
    // Não bloqueia o start — MinIO pode estar indisponível em testes
  }

  app.listen(PORT, () => {
    console.log(`GuardaApp API rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  });
}

start();
