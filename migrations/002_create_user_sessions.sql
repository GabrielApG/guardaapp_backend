CREATE TABLE IF NOT EXISTS user_sessions (
  id                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id             VARCHAR(36)   NOT NULL,
  refresh_token_hash  VARCHAR(255)  NOT NULL,
  device_name         VARCHAR(100)  NULL,
  device_os           VARCHAR(50)   NULL,
  ip_address          VARCHAR(45)   NULL,
  location            VARCHAR(100)  NULL,
  last_seen_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          DATETIME      NOT NULL,
  revoked_at          DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_sessions (user_id),
  INDEX idx_refresh_token (refresh_token_hash(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
