-- ============================================================
-- Migration 016 — Corrigir encoding de categorias com acento
-- Problema: ENUM com acentos (saúde, educação, vestuário) causa
-- WARN_DATA_TRUNCATED quando charset do cliente difere do servidor.
--
-- Estratégia segura (idempotente):
--   1. Converter coluna para VARCHAR (ignora validação de ENUM existente)
--   2. Normalizar dados existentes para ASCII
--   3. Converter de volta para ENUM com valores ASCII limpos
-- ============================================================

-- ── EVENTS ────────────────────────────────────────────────

-- Passo 1: VARCHAR temporário — neutro em relação ao ENUM atual
ALTER TABLE events
  MODIFY COLUMN category VARCHAR(50) NOT NULL DEFAULT 'outros';

-- Passo 2: normalizar dados
UPDATE events SET category = 'saude'
  WHERE category IN ('saúde', 'saúde', 'saÃºde');
-- valores sem acento já estão corretos; garante qualquer lixo vira 'outros'
UPDATE events SET category = 'outros'
  WHERE category NOT IN ('escola','saude','lazer','guarda','outros');

-- Passo 3: ENUM limpo
ALTER TABLE events
  MODIFY COLUMN category
    ENUM('escola','saude','lazer','guarda','outros')
    NOT NULL DEFAULT 'outros';

-- ── EXPENSES ──────────────────────────────────────────────

-- Passo 1: VARCHAR temporário
ALTER TABLE expenses
  MODIFY COLUMN category VARCHAR(50) NOT NULL DEFAULT 'outros';

-- Passo 2: normalizar dados (cobre acentos corretos e double-encoded)
UPDATE expenses SET category = 'saude'
  WHERE category IN ('saúde', 'saúde', 'saÃºde');
UPDATE expenses SET category = 'educacao'
  WHERE category IN ('educação', 'educação', 'educaÃ§Ã£o');
UPDATE expenses SET category = 'vestuario'
  WHERE category IN ('vestuário', 'vestuário', 'vestuÃ¡rio');
-- qualquer valor não reconhecido vira 'outros'
UPDATE expenses SET category = 'outros'
  WHERE category NOT IN ('saude','educacao','lazer','vestuario','outros');

-- Passo 3: ENUM limpo
ALTER TABLE expenses
  MODIFY COLUMN category
    ENUM('saude','educacao','lazer','vestuario','outros')
    NOT NULL DEFAULT 'outros';
