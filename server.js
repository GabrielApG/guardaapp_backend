require('dotenv').config();
const http = require('http');
const app  = require('./src/app');
const { initSocket } = require('./src/realtime/socket');
const { client, BUCKETS } = require('./src/config/minio');
const { startNotificationJobs } = require('./src/services/pushService');

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
const DENY_PUBLIC_POLICY = (bucket) => JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Deny',
    Principal: { AWS: ['*'] },
    Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
    Resource: [`arn:aws:s3:::${bucket}/*`],
    Condition: { StringEquals: { 's3:authType': 'REST-QUERY-STRING' } },
  }],
});

async function initBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, 'us-east-1');
      console.log(`[MinIO] Bucket criado: ${bucket}`);
    }
    try {
      const policy = await client.getBucketPolicy(bucket).catch(() => null);
      if (!policy) {
        await client.setBucketPolicy(bucket, DENY_PUBLIC_POLICY(bucket));
        console.log(`[MinIO] Política privada aplicada: ${bucket}`);
      }
    } catch (_) { /* MinIO pode não suportar políticas em todos os modos */ }
  }
}

async function start() {
  try {
    await initBuckets();
  } catch (err) {
    console.warn('[MinIO] Aviso ao inicializar buckets:', err.message);
    // Não bloqueia o start — MinIO pode estar indisponível em testes
  }

  // Servidor HTTP explícito — compartilhado entre Express e Socket.IO
  const server = http.createServer(app);

  // Acopla Socket.IO ao mesmo servidor HTTP (sobe em /socket.io por padrão)
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`GuardaApp API + WS rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  });

  // Inicia jobs de push notification (lembretes de eventos + digest diário)
  startNotificationJobs();
  console.log('[Push] Jobs de notificação iniciados.');
}

start();
