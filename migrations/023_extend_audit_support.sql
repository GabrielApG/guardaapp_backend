ALTER TABLE audit_events MODIFY event_type
  ENUM('message','expense','event','document','decision','login','logout',
       'health','vaccine','milestone','settings','lgpd','support') NOT NULL;
