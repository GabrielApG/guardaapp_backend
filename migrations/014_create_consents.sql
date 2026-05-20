CREATE TABLE IF NOT EXISTS user_consents (
  id           VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id      VARCHAR(36)   NOT NULL,
  consent_type ENUM('terms_of_use','privacy_policy','marketing_email','analytics') NOT NULL,
  version      VARCHAR(10)   NOT NULL,
  granted      TINYINT(1)    NOT NULL DEFAULT 0,
  granted_at   DATETIME      NULL,
  revoked_at   DATETIME      NULL,
  ip_address   VARCHAR(45)   NULL,
  user_agent   VARCHAR(300)  NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_consent_type (user_id, consent_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lgpd_export_jobs (
  id           VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id      VARCHAR(36)   NOT NULL,
  status       ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  download_url VARCHAR(1000) NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME      NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
