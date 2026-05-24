-- Migration 033: Campos CLT no acordo de pensão (desconto em folha)
-- Permite registrar valor base do salário CLT e percentual de desconto
-- quando a modalidade de pagamento for 'desconto_em_folha'.

ALTER TABLE support_agreements
  ADD COLUMN clt_base_salary        DECIMAL(10,2) NULL COMMENT 'Salário base CLT do alimentante (R$) — preenchido quando payment_mode = desconto_em_folha',
  ADD COLUMN clt_discount_percentage DECIMAL(5,2)  NULL COMMENT 'Percentual de desconto em folha (%) — ex: 30.00 para 30%';
