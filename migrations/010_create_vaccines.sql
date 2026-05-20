CREATE TABLE IF NOT EXISTS vaccines (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id      VARCHAR(36)   NOT NULL,
  name          VARCHAR(150)  NOT NULL,
  total_doses   INT           NOT NULL DEFAULT 1,
  doses_given   INT           NOT NULL DEFAULT 0,
  next_due_date DATE          NULL,
  status        ENUM('ok','pending','overdue') NOT NULL DEFAULT 'pending',
  pni_code      VARCHAR(20)   NULL,
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  INDEX idx_child_vaccines (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vaccine_doses (
  id               VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  vaccine_id       VARCHAR(36)   NOT NULL,
  dose_number      INT           NOT NULL,
  applied_date     DATE          NOT NULL,
  applied_by       VARCHAR(200)  NULL,
  batch_number     VARCHAR(50)   NULL,
  registered_by_id VARCHAR(36)   NOT NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (vaccine_id)       REFERENCES vaccines(id) ON DELETE CASCADE,
  FOREIGN KEY (registered_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
