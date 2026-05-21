ALTER TABLE documents
  MODIFY COLUMN category ENUM('legal','medical','school','identity','other') NOT NULL DEFAULT 'other';
