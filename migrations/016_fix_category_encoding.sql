-- ============================================================
-- Migration 016 — Corrigir encoding de categorias com acento
-- Problema: ENUM com acentos (saúde, educação, vestuário) causa
-- WARN_DATA_TRUNCATED quando o cliente MySQL usa charset diferente.
-- Solução: trocar por equivalentes ASCII.
-- ============================================================

-- 1. Eventos: saúde → saude (único valor com acento)
ALTER TABLE events
  MODIFY COLUMN category
    ENUM('escola','saude','lazer','guarda','outros')
    NOT NULL;

-- 2. Despesas: saúde → saude, educação → educacao, vestuário → vestuario
--    Passo A: ampliar ENUM para aceitar os dois formatos temporariamente
ALTER TABLE expenses
  MODIFY COLUMN category
    ENUM('saúde','educação','lazer','vestuário','outros','saude','educacao','vestuario')
    NOT NULL;

--    Passo B: normalizar valores existentes
UPDATE expenses SET category = 'saude'    WHERE category = 'saúde';
UPDATE expenses SET category = 'educacao' WHERE category = 'educação';
UPDATE expenses SET category = 'vestuario' WHERE category = 'vestuário';

--    Passo C: remover os valores antigos do ENUM
ALTER TABLE expenses
  MODIFY COLUMN category
    ENUM('saude','educacao','lazer','vestuario','outros')
    NOT NULL;
