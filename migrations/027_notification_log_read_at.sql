-- Migration 027: adiciona read_at em notification_log para controle de leitura
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS read_at DATETIME NULL DEFAULT NULL;

-- Índice para acelerar a query de unread-count por usuário
CREATE INDEX IF NOT EXISTS idx_notif_log_user_read
  ON notification_log (user_id, read_at);
