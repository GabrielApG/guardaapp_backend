CREATE TABLE IF NOT EXISTS coparent_connections (
  id                VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id_a         VARCHAR(36)   NOT NULL,
  user_id_b         VARCHAR(36)   NOT NULL,
  invite_code       VARCHAR(12)   NOT NULL UNIQUE,
  invite_email      VARCHAR(255)  NULL,
  status            ENUM('pending','active','suspended','terminated') NOT NULL DEFAULT 'pending',
  protective_order  TINYINT(1)    NOT NULL DEFAULT 0,
  accepted_at       DATETIME      NULL,
  terminated_at     DATETIME      NULL,
  terminated_reason TEXT          NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id_a) REFERENCES users(id),
  FOREIGN KEY (user_id_b) REFERENCES users(id),
  INDEX idx_invite_code (invite_code),
  INDEX idx_users_connection (user_id_a, user_id_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
