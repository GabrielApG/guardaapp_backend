-- Migration 030: Momentos Probatórios
-- Estende milestones com marcação de evidência e cria tabela milestone_evidence (imutável)
-- Ref: SPEC_MOMENTOS_PROBATORIOS.md §4.2

-- Estende milestones: flag de evidência + referência à tabela de evidência
-- Nota: ADD COLUMN IF NOT EXISTS é MariaDB. No MySQL 8 a idempotência é garantida
-- pelo migration runner (esta migration só executa uma vez).
ALTER TABLE milestones
  ADD COLUMN is_evidentiary TINYINT(1) NOT NULL DEFAULT 0 AFTER photo_minio_key,
  ADD COLUMN evidence_id    VARCHAR(36) NULL AFTER is_evidentiary;

-- Evidência imutável (1:1 com a foto capturada na hora)
-- Regra: nunca UPDATE em campos de conteúdo/evidência. Correção = novo registro.
-- Exceção controlada: qr_minio_key e tsa_* podem ser preenchidos uma única vez
-- via processo de sistema (geração assíncrona).
CREATE TABLE IF NOT EXISTS milestone_evidence (
  id                 VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  milestone_id       VARCHAR(36)   NOT NULL,
  connection_id      VARCHAR(36)   NOT NULL,
  captured_by_id     VARCHAR(36)   NOT NULL,

  -- Conteúdo / storage
  storage_key        VARCHAR(500)  NOT NULL,         -- MinIO (bucket MILESTONES)
  content_sha256     CHAR(64)      NOT NULL,         -- L3: hash SHA-256 do binário, calculado no servidor
  content_type       VARCHAR(100)  NOT NULL,
  byte_size          BIGINT        NOT NULL,

  -- L1 — declarado pelo client (NULLABLE; forjável; valor como indício, não prova)
  device_brand       VARCHAR(80)   NULL,             -- expo-device Device.brand
  device_model       VARCHAR(120)  NULL,             -- Device.modelName
  device_os          VARCHAR(40)   NULL,             -- Device.osName
  device_os_version  VARCHAR(40)   NULL,
  device_name        VARCHAR(120)  NULL,             -- Device.deviceName
  client_captured_at DATETIME(3)   NULL,             -- relógio do aparelho (informativo)
  client_timezone    VARCHAR(64)   NULL,             -- ex.: America/Sao_Paulo
  exif_taken_at      DATETIME(3)   NULL,             -- EXIF DateTimeOriginal
  exif_gps_lat       DECIMAL(10,7) NULL,
  exif_gps_lng       DECIMAL(10,7) NULL,
  exif_raw           JSON          NULL,             -- EXIF completo, como recebido

  -- L2 — observado pelo servidor (fonte de verdade temporal)
  server_received_at DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  source_ip          VARCHAR(45)   NULL,             -- IPv4/IPv6 (req.ip com trust proxy)
  user_agent         VARCHAR(255)  NULL,
  geoip_country      VARCHAR(2)    NULL,
  geoip_region       VARCHAR(80)   NULL,
  geoip_city         VARCHAR(120)  NULL,
  geoip_source       VARCHAR(40)   NULL,             -- ex.: 'ip-api.com', 'local-db', 'unavailable'

  -- L4 — encadeamento (selo de integridade do registro)
  record_hash        CHAR(64)      NOT NULL,         -- SHA-256 do payload canônico + previous_hash
  previous_hash      CHAR(64)      NULL,             -- hash do registro anterior da conexão (NULL = gênese)
  audit_event_id     VARCHAR(36)   NULL,             -- FK lógica p/ audit_events (cruzamento com trilha geral)

  -- Verificação pública
  protocol           VARCHAR(40)   NOT NULL,         -- ex.: MOM-2026-AB12CD
  qr_minio_key       VARCHAR(500)  NULL,             -- PNG do QR gerado server-side (preenchido assincronamente)

  -- Reservado para v2: carimbo de tempo de terceiro (RFC 3161 / ICP-Brasil)
  tsa_token          MEDIUMBLOB    NULL,
  tsa_authority      VARCHAR(120)  NULL,

  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_protocol   (protocol),
  UNIQUE KEY uq_milestone  (milestone_id),
  FOREIGN KEY (milestone_id)   REFERENCES milestones(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id)  REFERENCES coparent_connections(id),
  FOREIGN KEY (captured_by_id) REFERENCES users(id),
  INDEX idx_conn_created (connection_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
