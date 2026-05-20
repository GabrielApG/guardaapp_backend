CREATE TABLE IF NOT EXISTS audit_events (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NULL,
  actor_id      VARCHAR(36)   NOT NULL,
  event_type    ENUM('message','expense','event','document','decision','login','logout','health','vaccine','milestone','settings','lgpd') NOT NULL,
  description   TEXT          NOT NULL,
  entity_type   VARCHAR(50)   NULL,
  entity_id     VARCHAR(36)   NULL,
  hash          VARCHAR(64)   NOT NULL,
  previous_hash VARCHAR(64)   NULL,
  metadata      JSON          NULL,
  ip_address    VARCHAR(45)   NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (actor_id)      REFERENCES users(id),
  INDEX idx_connection_audit (connection_id, created_at),
  INDEX idx_hash_chain (hash),
  INDEX idx_actor_audit (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_exports (
  id                VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id     VARCHAR(36)   NOT NULL,
  requested_by_id   VARCHAR(36)   NOT NULL,
  status            ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  download_url      VARCHAR(1000) NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      DATETIME      NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id)   REFERENCES coparent_connections(id),
  FOREIGN KEY (requested_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
