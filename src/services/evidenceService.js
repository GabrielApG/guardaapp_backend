/**
 * evidenceService.js — Momentos Probatórios
 *
 * Lógica de evidência encadeada para marcos com valor probatório.
 * Ref: SPEC_MOMENTOS_PROBATORIOS.md
 *
 * Regras de imutabilidade:
 * - milestone_evidence nunca recebe UPDATE em campos de conteúdo/evidência.
 * - Soft-delete do marco registra auditoria, mas não apaga a evidência.
 * - qr_minio_key pode ser preenchido uma única vez via setQrKey() (geração assíncrona).
 */

const crypto             = require('crypto');
const db                 = require('../config/database');
const { v4: uuidv4 }     = require('uuid');
const hashChain          = require('./hashChain');
const auditService       = require('./auditService');
const storage            = require('./storage');
const timestampService   = require('./timestampService');
const { BUCKETS }        = require('../config/minio');

// ─── Protocolo ───────────────────────────────────────────────────────────────

function generateProtocol() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MOM-${year}-${rand}`;
}

// ─── Hash de conteúdo (L3) ───────────────────────────────────────────────────

function computeContentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─── Hash do registro (L4) — encadeado por conexão ───────────────────────────

async function getLastEvidenceHash(connectionId) {
  const [rows] = await db.query(
    'SELECT record_hash FROM milestone_evidence WHERE connection_id = ? ORDER BY created_at DESC LIMIT 1',
    [connectionId]
  );
  return rows.length ? rows[0].record_hash : null;
}

function computeRecordHash(payload, previousHash) {
  return hashChain.computeHash(payload, previousHash);
}

// ─── Geo-por-IP (L2) — sem dependência externa ───────────────────────────────
// Usa api pública via fetch nativo como fallback leve.
// Em produção, substituir por base local (§8 da spec).

async function resolveGeoIp(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: null, region: null, city: null, source: 'loopback' };
  }
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000);
    const res        = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { country: null, region: null, city: null, source: 'unavailable' };
    const data = await res.json();
    if (data.status !== 'success') return { country: null, region: null, city: null, source: 'unavailable' };
    return {
      country: data.countryCode || null,
      region:  data.regionName  || null,
      city:    data.city        || null,
      source:  'ip-api.com',
    };
  } catch {
    return { country: null, region: null, city: null, source: 'unavailable' };
  }
}

// ─── Parse defensivo de metadados L1 ─────────────────────────────────────────

function parseClientMeta(raw) {
  if (!raw) return {};
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      deviceBrand:      m.deviceBrand       || null,
      deviceModel:      m.deviceModel       || null,
      deviceOs:         m.deviceOs          || null,
      deviceOsVersion:  m.deviceOsVersion   || null,
      deviceName:       m.deviceName        || null,
      clientCapturedAt: m.clientCapturedAt  || null,
      clientTimezone:   m.clientTimezone    || null,
      // Flag root/jailbreak (expo-device). Só aceita boolean explícito;
      // qualquer outra coisa vira null ("não foi possível determinar").
      deviceIsRooted:   typeof m.deviceIsRooted === 'boolean' ? m.deviceIsRooted : null,
      exif:             m.exif              || null,
    };
  } catch {
    return {};
  }
}

function extractExifFields(exif) {
  if (!exif) return { takenAt: null, lat: null, lng: null };
  let takenAt = null;
  if (exif.DateTimeOriginal) {
    // Formato EXIF: "YYYY:MM:DD HH:MM:SS"
    const norm = exif.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const d    = new Date(norm);
    takenAt    = isNaN(d.getTime()) ? null : d.toISOString();
  }
  const lat = exif.GPSLatitude  ?? null;
  const lng = exif.GPSLongitude ?? null;
  return { takenAt, lat, lng };
}

// ─── Criação ──────────────────────────────────────────────────────────────────

/**
 * Cria um momento probatório completo.
 *
 * @param {object} opts
 * @param {Buffer}  opts.buffer       - binário da imagem
 * @param {string}  opts.originalname - nome original do arquivo
 * @param {string}  opts.mimetype     - content-type
 * @param {string}  opts.connectionId
 * @param {string}  opts.capturedById - userId de quem registrou
 * @param {string}  opts.childId
 * @param {string}  opts.title
 * @param {string}  [opts.description]
 * @param {string}  [opts.clientMetaRaw] - JSON string do §5.2
 * @param {string}  opts.sourceIp
 * @param {string}  opts.userAgent
 *
 * @returns {{ evidenceId, milestoneId, protocol, contentSha256, serverReceivedAt, verifyUrl }}
 */
async function createEvidentiary(opts) {
  const {
    buffer, originalname, mimetype,
    connectionId, capturedById, childId,
    title, description,
    clientMetaRaw, sourceIp, userAgent,
  } = opts;

  const serverReceivedAt = new Date();

  // L3 — hash do conteúdo, calculado no servidor
  const contentSha256 = computeContentHash(buffer);

  // Upload MinIO antes da transação (idempotente em relação ao DB)
  const storageKey = await storage.uploadMilestonePhoto(
    { buffer, originalname, mimetype },
    `evidentiary/${connectionId}`
  );

  // L2 — geo-por-IP (fire-and-forget em relação ao tempo de resposta, mas aguardamos para persistir)
  const geo = await resolveGeoIp(sourceIp);

  // L1 — parse defensivo
  const meta = parseClientMeta(clientMetaRaw);
  const exif = extractExifFields(meta.exif);

  // L4 — encadeamento
  const previousHash = await getLastEvidenceHash(connectionId);
  const evidenceId   = uuidv4();
  const milestoneId  = uuidv4();
  const protocol     = generateProtocol();

  // Payload canônico para o hash — regras de estabilidade:
  // 1. Campos escalares apenas (string, number, null) — sem objetos/arrays
  // 2. EXIF bruto EXCLUÍDO: MySQL 8 normaliza key-order de colunas JSON e quebra
  //    o determinismo do JSON.stringify. Usar apenas os campos extraídos em colunas escalares.
  // 3. Datas como ISO string (Date.toISOString) — ambos os lados devem usar a mesma conversão.
  // 4. Qualquer alteração neste shape invalida registros anteriores (append-only by design).
  const canonicalPayload = {
    id:               evidenceId,
    milestoneId,
    connectionId,
    capturedById,
    contentSha256,
    byteSize:         buffer.length,
    contentType:      mimetype,
    serverReceivedAt: serverReceivedAt.toISOString(),
    sourceIp:         sourceIp || null,
    protocol,
    client: {
      deviceBrand:      meta.deviceBrand      || null,
      deviceModel:      meta.deviceModel      || null,
      deviceOs:         meta.deviceOs         || null,
      deviceOsVersion:  meta.deviceOsVersion  || null,
      deviceName:       meta.deviceName       || null,
      // Normalizar via new Date().toISOString() para garantir mesmo formato no round-trip:
      // criação usa string bruta do mobile → normaliza aqui.
      // verificação usa DB DATETIME → normaliza via new Date().toISOString() também.
      clientCapturedAt: meta.clientCapturedAt
        ? new Date(meta.clientCapturedAt).toISOString()
        : null,
      clientTimezone:   meta.clientTimezone   || null,
      exifTakenAt:      exif.takenAt          || null, // string ISO extraída do EXIF
      exifGpsLat:       exif.lat              !== null ? String(exif.lat) : null, // string p/ evitar float precision
      exifGpsLng:       exif.lng              !== null ? String(exif.lng) : null,
      // exif blob excluído: MySQL JSON normaliza key-order → hash não-determinístico
    },
  };
  // deviceIsRooted entra no hash SOMENTE quando determinado (boolean). Quando null,
  // a chave é OMITIDA — assim registros antigos (sem o campo) produzem exatamente o
  // mesmo payload canônico de antes e continuam verificando ÍNTEGRO. Ver migration 032.
  if (meta.deviceIsRooted !== null) {
    canonicalPayload.client.deviceIsRooted = meta.deviceIsRooted;
  }
  const recordHash = computeRecordHash(canonicalPayload, previousHash);

  // clock_delta_ms — derivado, NÃO entra no hash (clientCapturedAt e serverReceivedAt
  // já estão no payload canônico). Indício de relógio do device adulterado.
  const clockDeltaMs = meta.clientCapturedAt
    ? serverReceivedAt.getTime() - new Date(meta.clientCapturedAt).getTime()
    : null;

  // Transação: milestone + evidence atomicamente
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // milestone_date é DATE (não DATETIME) — extrair apenas a parte de data
    const milestoneDate = serverReceivedAt.toISOString().substring(0, 10); // YYYY-MM-DD

    // Cria o milestone
    await conn.query(
      `INSERT INTO milestones
         (id, child_id, connection_id, created_by_id, title, description, milestone_date,
          emoji, photo_minio_key, is_evidentiary, evidence_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [milestoneId, childId, connectionId, capturedById,
       title || 'Momento registrado', description || null,
       milestoneDate, '📷', storageKey, evidenceId]
    );

    // Cria a evidência (imutável)
    await conn.query(
      `INSERT INTO milestone_evidence
         (id, milestone_id, connection_id, captured_by_id,
          storage_key, content_sha256, content_type, byte_size,
          device_brand, device_model, device_os, device_os_version, device_name,
          device_is_rooted,
          client_captured_at, client_timezone, clock_delta_ms,
          exif_taken_at, exif_gps_lat, exif_gps_lng, exif_raw,
          server_received_at, source_ip, user_agent,
          geoip_country, geoip_region, geoip_city, geoip_source,
          record_hash, previous_hash,
          protocol)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        evidenceId, milestoneId, connectionId, capturedById,
        storageKey, contentSha256, mimetype, buffer.length,
        meta.deviceBrand, meta.deviceModel, meta.deviceOs, meta.deviceOsVersion, meta.deviceName,
        meta.deviceIsRooted === null ? null : (meta.deviceIsRooted ? 1 : 0),
        meta.clientCapturedAt ? new Date(meta.clientCapturedAt) : null,
        meta.clientTimezone, clockDeltaMs,
        exif.takenAt  ? new Date(exif.takenAt) : null,
        exif.lat, exif.lng,
        meta.exif     ? JSON.stringify(meta.exif) : null,
        serverReceivedAt,
        sourceIp || null, userAgent || null,
        geo.country, geo.region, geo.city, geo.source,
        recordHash, previousHash,
        protocol,
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Auditoria geral (encadeada em audit_events — âncora cruzada com L4 próprio)
  const auditEventId = await auditService.log(
    connectionId, capturedById, 'milestone',
    'Momento probatório registrado',
    { protocol, contentSha256, milestoneId, evidenceId }
  );

  // Atualiza audit_event_id na evidência (campo informativo, não afeta cadeia)
  await db.query('UPDATE milestone_evidence SET audit_event_id = ? WHERE id = ?', [auditEventId, evidenceId]);

  // QR gerado assincronamente — fire-and-forget, não bloqueia resposta
  _generateQrAsync(evidenceId, protocol).catch(() => {});

  // Carimbo de tempo RFC 3161 (ICP-Brasil) — fire-and-forget. Aplicado SOBRE o
  // record_hash já selado, não entra no payload canônico. Se a ACT estiver indisponível,
  // a evidência permanece tsa_status='pending' e o worker (startTimestampJobs) reprocessa.
  if (timestampService.isEnabled()) {
    timestampService.sealEvidence(evidenceId).catch(() => {});
  }

  return {
    evidenceId,
    milestoneId,
    protocol,
    contentSha256,
    serverReceivedAt: serverReceivedAt.toISOString(),
    verifyUrl: `${process.env.APP_BASE_URL || 'https://guardaapp.com.br'}/verify/${protocol}`,
    qrUrl: null, // disponível depois via GET evidence
  };
}

// ─── Geração assíncrona do QR PNG ────────────────────────────────────────────

async function _generateQrAsync(evidenceId, protocol) {
  const QRCode = require('qrcode');
  const url    = `${process.env.APP_BASE_URL || 'https://guardaapp.com.br'}/verify/${protocol}`;
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 300, margin: 2 });
  const key    = await storage.uploadMilestonePhoto(
    { buffer, originalname: `${protocol}.png`, mimetype: 'image/png' },
    'evidentiary/qr'
  );
  await setQrKey(evidenceId, key);
}

async function setQrKey(evidenceId, qrMinioKey) {
  // Única exceção controlada de UPDATE: preenchimento do QR após geração assíncrona
  await db.query(
    'UPDATE milestone_evidence SET qr_minio_key = ? WHERE id = ? AND qr_minio_key IS NULL',
    [qrMinioKey, evidenceId]
  );
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

async function getEvidenceByMilestone(milestoneId) {
  const [rows] = await db.query(
    'SELECT * FROM milestone_evidence WHERE milestone_id = ?',
    [milestoneId]
  );
  return rows[0] || null;
}

async function getEvidenceByProtocol(protocol) {
  const [rows] = await db.query(
    'SELECT * FROM milestone_evidence WHERE protocol = ?',
    [protocol]
  );
  return rows[0] || null;
}

// ─── Verificação de integridade ───────────────────────────────────────────────

/**
 * Recomputa o record_hash local e valida o elo com o registro anterior.
 * Não faz download do binário do MinIO (leve; sob demanda).
 */
async function verifyEvidenceIntegrity(evidence) {
  // Deve espelhar EXATAMENTE o shape do canonicalPayload em createEvidentiary.
  // Qualquer divergência quebra o hash. Ver comentários nessa função.
  const canonicalPayload = {
    id:               evidence.id,
    milestoneId:      evidence.milestone_id,
    connectionId:     evidence.connection_id,
    capturedById:     evidence.captured_by_id,
    contentSha256:    evidence.content_sha256,
    byteSize:         Number(evidence.byte_size),
    contentType:      evidence.content_type,
    serverReceivedAt: new Date(evidence.server_received_at).toISOString(),
    sourceIp:         evidence.source_ip || null,
    protocol:         evidence.protocol,
    client: {
      deviceBrand:      evidence.device_brand      || null,
      deviceModel:      evidence.device_model      || null,
      deviceOs:         evidence.device_os         || null,
      deviceOsVersion:  evidence.device_os_version || null,
      deviceName:       evidence.device_name       || null,
      // Normalizar explicitamente: mysql2 pode retornar Date object ou string MySQL ("YYYY-MM-DD HH:MM:SS").
      // Ambos devem produzir o mesmo ISO string que foi usado na criação.
      clientCapturedAt: evidence.client_captured_at
        ? new Date(evidence.client_captured_at).toISOString()
        : null,
      clientTimezone:   evidence.client_timezone   || null,
      exifTakenAt:      evidence.exif_taken_at
        ? new Date(evidence.exif_taken_at).toISOString()
        : null,
      exifGpsLat: evidence.exif_gps_lat !== null && evidence.exif_gps_lat !== undefined
        ? String(evidence.exif_gps_lat)
        : null,
      exifGpsLng: evidence.exif_gps_lng !== null && evidence.exif_gps_lng !== undefined
        ? String(evidence.exif_gps_lng)
        : null,
      // exif blob excluído — ver createEvidentiary
    },
  };
  // Espelha a regra condicional de createEvidentiary: deviceIsRooted entra no hash
  // SOMENTE quando não-nulo. TINYINT do mysql2 vem como número (0/1) → converter p/
  // boolean, idêntico ao que foi serializado na criação. NULL = chave omitida.
  if (evidence.device_is_rooted !== null && evidence.device_is_rooted !== undefined) {
    canonicalPayload.client.deviceIsRooted = Boolean(evidence.device_is_rooted);
  }

  const recomputed   = computeRecordHash(canonicalPayload, evidence.previous_hash);
  const hashMatch    = recomputed === evidence.record_hash;

  // Valida elo com anterior (se existir)
  let chainValid = true;
  if (evidence.previous_hash) {
    const [prev] = await db.query(
      'SELECT record_hash FROM milestone_evidence WHERE connection_id = ? AND record_hash = ?',
      [evidence.connection_id, evidence.previous_hash]
    );
    chainValid = prev.length > 0;
  }

  return {
    hashMatch,
    chainValid,
    verdict: hashMatch && chainValid ? 'ÍNTEGRO' : 'INCONSISTENTE',
    recomputed,
    stored: evidence.record_hash,
  };
}

module.exports = {
  createEvidentiary,
  getEvidenceByMilestone,
  getEvidenceByProtocol,
  getLastEvidenceHash,
  verifyEvidenceIntegrity,
  setQrKey,
  generateProtocol,
};
