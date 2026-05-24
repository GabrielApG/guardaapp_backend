/**
 * evidenceController.js — Momentos Probatórios
 * Ref: SPEC_MOMENTOS_PROBATORIOS.md §6
 */

const evidenceService     = require('../services/evidenceService');
const milestoneService    = require('../services/milestoneService');
const storage             = require('../services/storage');
const pdfExport           = require('../services/pdfExport');
const notificationService = require('../services/notificationService');
const timestampService    = require('../services/timestampService');
const db                  = require('../config/database');
const { BUCKETS }         = require('../config/minio');

const PHOTO_TTL = 3600; // 1h

// Tipos de imagem aceitos
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

// ─── Sanitização de evidência para resposta ───────────────────────────────────

async function sanitizeEvidence(ev, includePhoto = true) {
  const photoUrl = includePhoto
    ? await storage.generatePresignedUrl(ev.storage_key, BUCKETS.MILESTONES, PHOTO_TTL).catch(() => null)
    : null;
  const qrUrl = ev.qr_minio_key
    ? await storage.generatePresignedUrl(ev.qr_minio_key, BUCKETS.MILESTONES, PHOTO_TTL).catch(() => null)
    : null;

  return {
    id:        ev.id,
    protocol:  ev.protocol,
    verifyUrl: `${process.env.APP_BASE_URL || 'https://guardaapp.com.br'}/verify/${ev.protocol}`,
    photoUrl,
    qrUrl,
    // L1 — declarado pelo client
    l1: {
      deviceBrand:      ev.device_brand      || null,
      deviceModel:      ev.device_model      || null,
      deviceOs:         ev.device_os         || null,
      deviceOsVersion:  ev.device_os_version || null,
      deviceName:       ev.device_name       || null,
      deviceIsRooted:   ev.device_is_rooted === null || ev.device_is_rooted === undefined ? null : Boolean(ev.device_is_rooted),
      clientCapturedAt: ev.client_captured_at || null,
      clientTimezone:   ev.client_timezone    || null,
      clockDeltaMs:     ev.clock_delta_ms !== null && ev.clock_delta_ms !== undefined ? Number(ev.clock_delta_ms) : null,
      exifTakenAt:      ev.exif_taken_at      || null,
      exifGpsLat:       ev.exif_gps_lat !== null ? parseFloat(ev.exif_gps_lat) : null,
      exifGpsLng:       ev.exif_gps_lng !== null ? parseFloat(ev.exif_gps_lng) : null,
    },
    // L2 — observado pelo servidor
    l2: {
      serverReceivedAt: ev.server_received_at,
      sourceIp:         ev.source_ip  || null,
      userAgent:        ev.user_agent || null,
      geoipCountry:     ev.geoip_country || null,
      geoipRegion:      ev.geoip_region  || null,
      geoipCity:        ev.geoip_city    || null,
      geoipSource:      ev.geoip_source  || null,
    },
    // L3 — integridade do conteúdo
    l3: {
      contentSha256: ev.content_sha256,
      contentType:   ev.content_type,
      byteSize:      Number(ev.byte_size),
    },
    // L4 — encadeamento
    l4: {
      recordHash:   ev.record_hash,
      previousHash: ev.previous_hash || null,
      auditEventId: ev.audit_event_id || null,
    },
    // L5 — carimbo de tempo RFC 3161 (ICP-Brasil). Token bruto NÃO é exposto na API.
    l5: {
      status:    ev.tsa_status   || 'pending',
      authority: ev.tsa_authority || null,
      genTime:   ev.tsa_gentime  || null,   // hora oficial atestada pela ACT
      serial:    ev.tsa_serial   || null,
      sealedAt:  ev.tsa_sealed_at || null,
      hasToken:  !!ev.tsa_token,
    },
    createdAt: ev.created_at,
  };
}

// ─── POST /milestones/evidentiary ─────────────────────────────────────────────

async function createEvidentiary(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Foto obrigatória.' } });
    }
    if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
      return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA', message: 'Formato não suportado. Use JPEG, PNG ou HEIC.' } });
    }
    if (!req.body.childId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'childId é obrigatório.' } });
    }

    const result = await evidenceService.createEvidentiary({
      buffer:        req.file.buffer,
      originalname:  req.file.originalname || `evidentiary.jpg`,
      mimetype:      req.file.mimetype,
      connectionId:  req.connectionId,
      capturedById:  req.userId,
      childId:       req.body.childId,
      title:         req.body.title        || null,
      description:   req.body.description  || null,
      clientMetaRaw: req.body.clientMeta   || null,
      sourceIp:      req.ip,
      userAgent:     req.headers['user-agent'] || null,
    });

    // Notifica coparente (fire-and-forget)
    notificationService.notifyCoparent(req.connectionId, req.userId, 'milestone', {
      protocol: result.protocol,
    }).catch(() => {});

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ─── GET /milestones/:milestoneId/evidence ────────────────────────────────────

async function getEvidence(req, res, next) {
  try {
    const ev = await evidenceService.getEvidenceByMilestone(req.params.milestoneId);
    if (!ev) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidência não encontrada.' } });
    }
    // Garante que a evidência pertence à conexão autenticada
    if (ev.connection_id !== req.connectionId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } });
    }

    // Verificação de integridade local (rápida, sem I/O do MinIO)
    const integrity = await evidenceService.verifyEvidenceIntegrity(ev);

    const data = await sanitizeEvidence(ev);
    data.integrity = integrity;

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── GET /milestones/:milestoneId/evidence/certificate.pdf ───────────────────

async function getCertificatePdf(req, res, next) {
  try {
    const ev = await evidenceService.getEvidenceByMilestone(req.params.milestoneId);
    if (!ev) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidência não encontrada.' } });
    if (ev.connection_id !== req.connectionId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });

    // Download do binário para validação de hash (pesado — apenas no certificado)
    let photoBuffer = null;
    let contentHashVerified = false;
    try {
      const { client } = require('../config/minio');
      const chunks = [];
      const stream = await client.getObject(BUCKETS.MILESTONES, ev.storage_key);
      await new Promise((resolve, reject) => {
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      photoBuffer = Buffer.concat(chunks);
      const recomputed = require('crypto').createHash('sha256').update(photoBuffer).digest('hex');
      contentHashVerified = recomputed === ev.content_sha256;
    } catch { /* foto não disponível; certificado ainda é gerado sem ela */ }

    const integrity = await evidenceService.verifyEvidenceIntegrity(ev);

    const pdfBuffer = await pdfExport.generateMilestoneCertificatePdf({
      evidence: ev,
      integrity,
      photoBuffer,
      contentHashVerified,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-${ev.protocol}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
}

// ─── POST /milestones/:milestoneId/evidence/seal — retry manual do carimbo ────

async function sealEvidence(req, res, next) {
  try {
    const ev = await evidenceService.getEvidenceByMilestone(req.params.milestoneId);
    if (!ev) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidência não encontrada.' } });
    }
    if (ev.connection_id !== req.connectionId) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } });
    }
    if (!timestampService.isEnabled()) {
      return res.status(503).json({ success: false, error: { code: 'TSA_DISABLED', message: 'Carimbo de tempo não configurado neste ambiente.' } });
    }
    if (ev.tsa_status === 'sealed') {
      return res.json({ success: true, data: { status: 'sealed', alreadySealed: true } });
    }

    const result = await timestampService.sealEvidence(ev.id);
    const code = result.sealed ? 200 : 502;
    return res.status(code).json({ success: result.sealed, data: result });
  } catch (err) { next(err); }
}

// ─── GET /verify/:protocol — PÚBLICO, sem auth ───────────────────────────────

async function verifyByProtocol(req, res, next) {
  try {
    const { protocol } = req.params;
    const ev = await evidenceService.getEvidenceByProtocol(protocol);
    if (!ev) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Protocolo não encontrado.' } });
    }

    const integrity = await evidenceService.verifyEvidenceIntegrity(ev);

    // Sanitização mínima para rota pública: sem identidade da criança/coparente
    // Retorna apenas dados técnicos e metadados rotulados por fonte
    const publicData = {
      protocol:  ev.protocol,
      verdict:   integrity.verdict,
      integrity: {
        hashMatch:  integrity.hashMatch,
        chainValid: integrity.chainValid,
        recordHash: ev.record_hash,
        previousHash: ev.previous_hash || null,
      },
      // L2 — observado pelo servidor (sem IP, por privacidade)
      serverReceivedAt: ev.server_received_at,
      geoipCity:    ev.geoip_city    || null,
      geoipRegion:  ev.geoip_region  || null,
      geoipCountry: ev.geoip_country || null,
      geoipSource:  ev.geoip_source  || null,
      // L3 — integridade do conteúdo
      contentSha256: ev.content_sha256,
      contentType:   ev.content_type,
      byteSize:      Number(ev.byte_size),
      // L1 — declarado pelo aparelho (rotulado como tal)
      deviceInfo: {
        brand:   ev.device_brand   || null,
        model:   ev.device_model   || null,
        os:      ev.device_os      || null,
        version: ev.device_os_version || null,
        // Sinais anti-spoofing: device comprometido / relógio divergente
        isRooted:    ev.device_is_rooted === null || ev.device_is_rooted === undefined ? null : Boolean(ev.device_is_rooted),
        clockDeltaMs: ev.clock_delta_ms !== null && ev.clock_delta_ms !== undefined ? Number(ev.clock_delta_ms) : null,
      },
      exifTakenAt: ev.exif_taken_at || null,
      // GPS mascarado para evitar exposição de localização precisa
      exifHasGps: (ev.exif_gps_lat !== null && ev.exif_gps_lng !== null),
      // L5 — carimbo de tempo RFC 3161 (ICP-Brasil): hora oficial atestada por terceiro
      timestamp: {
        status:    ev.tsa_status   || 'pending',
        authority: ev.tsa_authority || null,
        genTime:   ev.tsa_gentime  || null,
        serial:    ev.tsa_serial   || null,
      },
      createdAt:   ev.created_at,
      // Aviso legal obrigatório
      disclaimer: 'Registro com selo de integridade e trilha de auditoria. Os dados declarados pelo dispositivo (L1) são informativos e podem ser forjados em aparelhos comprometidos. A força probatória decorre do hash do conteúdo (L3), do encadeamento server-side (L4) e do carimbo de tempo RFC 3161 de Autoridade de Carimbo do Tempo credenciada ICP-Brasil (L5), quando presente.',
    };

    res.json({ success: true, data: publicData });
  } catch (err) { next(err); }
}

module.exports = { createEvidentiary, getEvidence, getCertificatePdf, sealEvidence, verifyByProtocol };
