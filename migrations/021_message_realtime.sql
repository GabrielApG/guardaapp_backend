-- Migration 021: Mensageria em Tempo Real (3 estados de tick + push tokens)
-- GuardaApp — aplicar com: npm run migrate
--
-- REGRA DOS TICKS (derivada, não há coluna status redundante):
--   created_at  preenchido, delivered_at NULL  → enviado   (✓ cinza)
--   delivered_at preenchido, read_at NULL      → entregue  (✓✓ cinza)
--   read_at preenchido                         → lido      (✓✓ azul)
--
-- IMPORTANTE: delivered_at e read_at são os ÚNICOS campos mutáveis
-- pós-criação em messages. O hash SHA-256 NÃO é recalculado — auditoria intacta.

-- ─── Adicionar delivered_at (idempotente via procedure) ──────────────────────

DROP PROCEDURE IF EXISTS _add_delivered_at;

DELIMITER $$
CREATE PROCEDURE _add_delivered_at()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'messages'
       AND COLUMN_NAME  = 'delivered_at'
  ) THEN
    ALTER TABLE messages
      ADD COLUMN delivered_at DATETIME NULL AFTER hash;
  END IF;
END$$
DELIMITER ;

CALL _add_delivered_at();
DROP PROCEDURE IF EXISTS _add_delivered_at;

-- ─── Adicionar índice de entrega (idempotente via procedure) ─────────────────

DROP PROCEDURE IF EXISTS _add_delivery_index;

DELIMITER $$
CREATE PROCEDURE _add_delivery_index()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'messages'
       AND INDEX_NAME   = 'idx_delivery_status'
  ) THEN
    ALTER TABLE messages
      ADD INDEX idx_delivery_status (conversation_id, sender_id, delivered_at, read_at);
  END IF;
END$$
DELIMITER ;

CALL _add_delivery_index();
DROP PROCEDURE IF EXISTS _add_delivery_index;

-- ─── Tabela de push tokens ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
  id           VARCHAR(36)           NOT NULL DEFAULT (UUID()),
  user_id      VARCHAR(36)           NOT NULL,
  expo_token   VARCHAR(255)          NOT NULL,
  platform     ENUM('ios','android') NOT NULL,
  last_seen_at DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at   DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_token (user_id, expo_token),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_push (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
