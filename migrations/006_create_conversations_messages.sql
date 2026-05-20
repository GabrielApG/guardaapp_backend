CREATE TABLE IF NOT EXISTS conversations (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NOT NULL UNIQUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  conversation_id VARCHAR(36)   NOT NULL,
  sender_id       VARCHAR(36)   NOT NULL,
  text            TEXT          NOT NULL,
  hash            VARCHAR(64)   NOT NULL,
  previous_hash   VARCHAR(64)   NULL,
  is_hostile      TINYINT(1)    NOT NULL DEFAULT 0,
  hostile_score   DECIMAL(4,3)  NULL,
  read_at         DATETIME      NULL,
  deleted_at      DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  INDEX idx_conversation_messages (conversation_id, created_at),
  INDEX idx_hash (hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_attachments (
  id          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  message_id  VARCHAR(36)   NOT NULL,
  file_name   VARCHAR(255)  NOT NULL,
  file_type   ENUM('image','pdf') NOT NULL,
  minio_key   VARCHAR(500)  NOT NULL,
  size_bytes  BIGINT        NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
