-- Migration 031: Carimbo de tempo RFC 3161 (ICP-Brasil) para Momentos Probatórios
-- Ref: SPEC_MOMENTOS_PROBATORIOS.md §9 / docs/arquitetura-diario-probatorio.md §5
--
-- Contexto: as colunas tsa_token (MEDIUMBLOB) e tsa_authority (VARCHAR) já foram
-- criadas na migration 030 como reserva ("v2"). Esta migration adiciona o workflow
-- de selagem assíncrona com retry, sem alterar o cálculo do record_hash (L4) —
-- o carimbo é aplicado SOBRE o record_hash já selado, portanto não entra no payload
-- canônico e não invalida registros anteriores.
--
-- Estados do carimbo:
--   pending : evidência criada, carimbo ainda não obtido (estado inicial)
--   sealed  : token RFC 3161 obtido e armazenado
--   failed  : tentativa(s) falharam; será reprocessado pelo worker até TSA_MAX_ATTEMPTS

ALTER TABLE milestone_evidence
  ADD COLUMN tsa_status     ENUM('pending','sealed','failed') NOT NULL DEFAULT 'pending' AFTER tsa_authority,
  ADD COLUMN tsa_gentime    DATETIME(3)  NULL AFTER tsa_status,   -- genTime oficial do token (Hora Legal Brasileira)
  ADD COLUMN tsa_serial     VARCHAR(128) NULL AFTER tsa_gentime,  -- número de série do TST
  ADD COLUMN tsa_sealed_at  DATETIME(3)  NULL AFTER tsa_serial,   -- quando o servidor armazenou o token
  ADD COLUMN tsa_attempts   INT          NOT NULL DEFAULT 0 AFTER tsa_sealed_at,
  ADD COLUMN tsa_last_error VARCHAR(255) NULL AFTER tsa_attempts;

-- Índice para o worker localizar evidências pendentes/falhas com eficiência
CREATE INDEX idx_tsa_status ON milestone_evidence (tsa_status, created_at);
