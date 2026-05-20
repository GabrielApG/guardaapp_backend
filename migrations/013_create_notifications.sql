CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id     VARCHAR(36)   NOT NULL,
  type        ENUM('new_message','expense_submitted','expense_approved','expense_contested','expense_paid','event_created','event_confirmed','event_conflict','document_uploaded','milestone_comment','vaccine_due','coparent_invite') NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  body        TEXT          NOT NULL,
  entity_type VARCHAR(50)   NULL,
  entity_id   VARCHAR(36)   NULL,
  read_at     DATETIME      NULL,
  push_sent_at DATETIME     NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_notifications (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)   NOT NULL UNIQUE,
  email_enabled TINYINT(1)    NOT NULL DEFAULT 1,
  push_enabled  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
