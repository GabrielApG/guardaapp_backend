ALTER TABLE audit_events
  MODIFY COLUMN event_type ENUM(
    'message','expense','event','document','decision',
    'login','logout','health','vaccine','milestone','settings','lgpd',
    'parenting_rule.created','parenting_rule.updated',
    'parenting_rule.cancelled','parenting_rule.confirmed','parenting_rule.rejected'
  ) NOT NULL;
