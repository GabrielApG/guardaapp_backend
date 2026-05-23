-- Operadores internos (realm separado dos usuários finais)
CREATE TABLE IF NOT EXISTS admin_users (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  admin_role      ENUM('superadmin','suporte','financeiro','auditor','compliance_dpo') NOT NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  mfa_secret      VARCHAR(64)  NULL COMMENT 'TOTP — MFA obrigatório p/ admin',
  mfa_enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_at   DATETIME     NULL,
  created_by_id   VARCHAR(36)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  INDEX idx_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id             VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  admin_id       VARCHAR(36)  NOT NULL,
  refresh_token  VARCHAR(255) NOT NULL,
  ip             VARCHAR(45)  NULL,
  user_agent     VARCHAR(255) NULL,
  expires_at     DATETIME     NOT NULL,
  revoked_at     DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  admin_id      VARCHAR(36)   NOT NULL,
  action        VARCHAR(80)   NOT NULL,
  target_type   VARCHAR(40)   NULL,
  target_id     VARCHAR(36)   NULL,
  description   TEXT          NOT NULL,
  metadata      JSON          NULL,
  ip            VARCHAR(45)   NULL,
  previous_hash CHAR(64)      NULL,
  hash          CHAR(64)      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_admin_action (admin_id, action),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS support_tickets (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)   NULL,
  subject       VARCHAR(200)  NOT NULL,
  body          TEXT          NOT NULL,
  category      ENUM('conta','pagamento','bug','denuncia','lgpd','outro') NOT NULL DEFAULT 'outro',
  status        ENUM('aberto','em_andamento','aguardando_usuario','resolvido','fechado') NOT NULL DEFAULT 'aberto',
  priority      ENUM('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
  assigned_to_id VARCHAR(36)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id)        REFERENCES users(id),
  FOREIGN KEY (assigned_to_id) REFERENCES admin_users(id),
  INDEX idx_status (status, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moderation_flags (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NOT NULL,
  content_type  ENUM('message','expense','document','milestone') NOT NULL,
  content_id    VARCHAR(36)   NOT NULL,
  reason        ENUM('linguagem_hostil','denuncia_usuario','suspeita_fraude','outro') NOT NULL,
  severity      ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  status        ENUM('pendente','em_analise','procedente','improcedente') NOT NULL DEFAULT 'pendente',
  reviewed_by_id VARCHAR(36)  NULL,
  reviewed_at   DATETIME      NULL,
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id)   REFERENCES coparent_connections(id),
  FOREIGN KEY (reviewed_by_id)  REFERENCES admin_users(id),
  INDEX idx_status (status, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
