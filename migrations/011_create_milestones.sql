CREATE TABLE IF NOT EXISTS milestones (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id        VARCHAR(36)   NOT NULL,
  connection_id   VARCHAR(36)   NOT NULL,
  created_by_id   VARCHAR(36)   NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  description     TEXT          NULL,
  milestone_date  DATE          NOT NULL,
  emoji           VARCHAR(10)   NOT NULL DEFAULT '🌟',
  photo_minio_key VARCHAR(500)  NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id)      REFERENCES children(id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  INDEX idx_child_milestones (child_id, milestone_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS milestone_photos (
  id           VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  milestone_id VARCHAR(36)   NOT NULL,
  storage_key  VARCHAR(500)  NOT NULL,
  caption      VARCHAR(300)  NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS milestone_comments (
  id           VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  milestone_id VARCHAR(36)   NOT NULL,
  author_id    VARCHAR(36)   NOT NULL,
  text         VARCHAR(500)  NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
