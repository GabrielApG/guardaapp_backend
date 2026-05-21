-- =====================================================================
-- 018_add_primary_residence_to_children.sql
-- Residência principal da criança.
-- ---------------------------------------------------------------------
-- Define o co-pai com quem a criança fica POR PADRÃO quando nenhuma
-- regra de convivência (parenting_time_rules) cobre um instante.
-- Permite cadastrar apenas as EXCEÇÕES (visitas) em vez de 100% do tempo
-- dos dois lados, reduzindo furos na trilha de auditoria.
--
-- Nullable e sem default: cadastros existentes seguem válidos (não-breaking).
-- =====================================================================

ALTER TABLE children
  ADD COLUMN primary_residence_user_id VARCHAR(36) NULL AFTER connection_id,
  ADD CONSTRAINT fk_children_primary_residence
    FOREIGN KEY (primary_residence_user_id) REFERENCES users(id);
