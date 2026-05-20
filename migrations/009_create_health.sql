CREATE TABLE IF NOT EXISTS health_entries (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id      VARCHAR(36)   NOT NULL,
  connection_id VARCHAR(36)   NOT NULL,
  created_by_id VARCHAR(36)   NOT NULL,
  type          ENUM('consulta','vacina','medicacao','exame','alergia') NOT NULL,
  title         VARCHAR(200)  NOT NULL,
  entry_date    DATE          NOT NULL,
  doctor        VARCHAR(200)  NULL,
  notes         TEXT          NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id)      REFERENCES children(id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  INDEX idx_child_health (child_id, entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
