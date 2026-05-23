-- Push token registry (Expo Push Tokens)
CREATE TABLE IF NOT EXISTS push_tokens (
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  token        VARCHAR(200) NOT NULL,
  platform     ENUM('ios','android','web') NOT NULL DEFAULT 'ios',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_token (user_id, token),
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id               CHAR(36)     NOT NULL,
  -- Evento criado
  new_event             TINYINT(1)   NOT NULL DEFAULT 1,
  -- Despesa criada
  new_expense           TINYINT(1)   NOT NULL DEFAULT 1,
  -- Lembretes de eventos (minutos antes): 3 dias = 4320, 1 dia = 1440, 1 hora = 60
  event_reminder_3d     TINYINT(1)   NOT NULL DEFAULT 1,
  event_reminder_1d     TINYINT(1)   NOT NULL DEFAULT 1,
  event_reminder_1h     TINYINT(1)   NOT NULL DEFAULT 1,
  event_reminder_custom INT          NULL,         -- minutos personalizados (NULL = desabilitado)
  -- Despesa pendente sem aprovação
  expense_pending       TINYINT(1)   NOT NULL DEFAULT 1,
  -- Pensão
  support_payment       TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Notification log (append-only, para auditoria)
CREATE TABLE IF NOT EXISTS notification_log (
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  type         VARCHAR(50)  NOT NULL,
  title        VARCHAR(200) NOT NULL,
  body         TEXT         NOT NULL,
  data         JSON         NULL,
  expo_id      VARCHAR(200) NULL,       -- ID retornado pela Expo
  status       ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_type (user_id, type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- Scheduled reminders (events que já dispararam notificação, para idempotência)
CREATE TABLE IF NOT EXISTS event_reminders_sent (
  event_id       CHAR(36)   NOT NULL,
  reminder_type  VARCHAR(20) NOT NULL,  -- '3d','1d','1h','custom'
  sent_at        TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, reminder_type)
) ENGINE=InnoDB;
