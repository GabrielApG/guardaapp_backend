-- Migration 028: consolida todos os valores do ENUM event_type em audit_events.
-- Inclui todos os tipos das migrations 012, 019 e 023 mais os novos de suporte.
ALTER TABLE audit_events MODIFY event_type
  ENUM(
    'message',
    'expense',
    'event',
    'document',
    'decision',
    'login',
    'logout',
    'health',
    'vaccine',
    'milestone',
    'settings',
    'lgpd',
    'parenting_rule.created',
    'parenting_rule.updated',
    'parenting_rule.cancelled',
    'parenting_rule.confirmed',
    'parenting_rule.rejected',
    'support'
  ) NOT NULL;
