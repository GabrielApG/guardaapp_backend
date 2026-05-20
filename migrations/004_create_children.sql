CREATE TABLE IF NOT EXISTS children (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NOT NULL,
  name          VARCHAR(150)  NOT NULL,
  birth_date    DATE          NOT NULL,
  school        VARCHAR(200)  NULL,
  doctor        VARCHAR(200)  NULL,
  avatar_url    VARCHAR(500)  NULL,
  emoji         VARCHAR(10)   NOT NULL DEFAULT '👧',
  blood_type    VARCHAR(5)    NULL,
  notes         TEXT          NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
