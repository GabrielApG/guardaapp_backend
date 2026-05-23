-- Migration 029: corrige schema de notification_preferences
--
-- Problema 1: migration 013 criou a tabela com schema antigo (email_enabled, push_enabled).
--             migration 026 usou CREATE TABLE IF NOT EXISTS → tabela já existia → novas colunas nunca adicionadas.
--             Resultado: prefs.new_expense = undefined → falsy → push ignorado.
--
-- Problema 2: uma migration anterior inseriu coluna com typo "ew_expense" (falta o 'n').
--             Essa coluna órfã é removida aqui.

-- Adiciona colunas que faltam (IF NOT EXISTS é idempotente)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS new_event            TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS new_expense          TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS event_reminder_3d    TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS event_reminder_1d    TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS event_reminder_1h    TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS event_reminder_custom INT        NULL     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expense_pending      TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS support_payment      TINYINT(1) NOT NULL DEFAULT 1;

-- Remove coluna com typo "ew_expense" se ainda existir
ALTER TABLE notification_preferences
  DROP COLUMN IF EXISTS ew_expense;
