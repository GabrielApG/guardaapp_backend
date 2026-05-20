CREATE TABLE IF NOT EXISTS documents (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id   VARCHAR(36)   NOT NULL,
  uploaded_by_id  VARCHAR(36)   NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  description     TEXT          NULL,
  category        ENUM('juridico','escola','saude','geral') NOT NULL DEFAULT 'geral',
  file_type       ENUM('pdf','image') NOT NULL,
  minio_key       VARCHAR(500)  NOT NULL,
  size_bytes      BIGINT        NOT NULL,
  checksum_sha256 VARCHAR(64)   NOT NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id)  REFERENCES coparent_connections(id),
  FOREIGN KEY (uploaded_by_id) REFERENCES users(id),
  INDEX idx_connection_docs (connection_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_access_log (
  id          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  document_id VARCHAR(36)   NOT NULL,
  user_id     VARCHAR(36)   NOT NULL,
  action      ENUM('view','download','share') NOT NULL DEFAULT 'view',
  ip_address  VARCHAR(45)   NULL,
  accessed_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
