-- =====================================================================
-- 017_create_parenting_time_rules.sql
-- Regime de convivência (parenting time / plano de parentalidade)
-- -------------------------------------------------------------------
-- Modela as REGRAS recorrentes de quem fica com a criança e quando
-- acontece a transferência física (busca / entrega). A agenda é
-- DERIVADA dessas regras, não copiada para a tabela `events`.
--
-- Cobre os dois padrões do MVP:
--   1) Dia da semana recorrente  (ex: busca quarta 18:00, entrega quinta 19:00)
--   2) Fim de semana alternado   (ex: sáb 09:00 -> dom 18:00, a cada 2 semanas)
-- Já preparada para feriados/férias via rule_type + priority (exceções
-- sobrepõem a rotina quando priority é maior).
--
-- CONVENÇÃO DE DIA DA SEMANA: ISO-8601 -> 1=segunda ... 7=domingo.
-- TODOS os horários são interpretados no fuso America/Sao_Paulo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS parenting_time_rules (
  id                 VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  connection_id      VARCHAR(36)  NOT NULL,
  child_id           VARCHAR(36)  NOT NULL,

  -- Qual co-pai FICA com a criança durante o bloco (busca -> entrega).
  -- Aponta para o usuário (lado A ou B da connection).
  responsible_user_id VARCHAR(36) NOT NULL,

  -- Tipo de regra. 'weekly' e 'alternating_weekend' são o MVP;
  -- 'holiday' e 'vacation' são exceções pontuais (usar effective_from/until).
  rule_type          ENUM('weekly','alternating_weekend','holiday','vacation','custom')
                       NOT NULL DEFAULT 'weekly',

  -- Rótulo amigável p/ UI e p/ relatório legal (ex: "Quarta com o pai").
  label              VARCHAR(150) NULL,

  -- ---- BUSCA (início do bloco de convivência) ----
  pickup_weekday     TINYINT      NOT NULL,         -- 1=seg ... 7=dom (ISO)
  pickup_time        TIME         NOT NULL,
  pickup_location    VARCHAR(300) NULL,             -- ex: "Escola", "Casa da mãe"

  -- ---- ENTREGA (fim do bloco de convivência) ----
  -- Pode cair em outro dia da semana (quarta 18h -> quinta 19h).
  dropoff_weekday    TINYINT      NOT NULL,         -- 1=seg ... 7=dom (ISO)
  dropoff_time       TIME         NOT NULL,
  dropoff_location   VARCHAR(300) NULL,

  -- Quem executa o transporte na transferência (logística), opcional.
  -- Quem busca a criança no início do bloco / quem entrega no fim.
  pickup_by_user_id  VARCHAR(36)  NULL,
  dropoff_by_user_id VARCHAR(36)  NULL,

  -- ---- Cadência ----
  -- 1 = toda semana; 2 = quinzenal/alternado; 3,4... permitido.
  cadence_weeks      TINYINT      NOT NULL DEFAULT 1,

  -- Âncora de paridade: uma data de BUSCA conhecida que pertence a
  -- responsible_user_id. Usada para calcular de quem é o fim de semana
  -- quando cadence_weeks > 1. Obrigatória na prática p/ FDS alternado.
  anchor_date        DATE         NULL,

  -- ---- Vigência ----
  effective_from     DATE         NOT NULL,
  effective_until    DATE         NULL,             -- NULL = indeterminado

  -- ---- Resolução de conflito entre regras ----
  -- Maior priority vence. Rotina = 0; feriado/férias usam valores maiores
  -- para sobrepor a rotina naquele período.
  priority           INT          NOT NULL DEFAULT 0,

  -- Origem legal da regra (sentença, acordo, provisório), p/ auditoria.
  source             ENUM('acordo','sentenca','provisorio','informal') NOT NULL DEFAULT 'acordo',

  notes              TEXT         NULL,

  -- Confirmação bilateral: alterar regime é juridicamente sensível.
  confirmed_by_creator  TINYINT(1) NOT NULL DEFAULT 1,
  confirmed_by_coparent TINYINT(1) NOT NULL DEFAULT 0,
  status                ENUM('pending','active','superseded','cancelled') NOT NULL DEFAULT 'pending',

  created_by_user_id VARCHAR(36)  NOT NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME     NULL,

  PRIMARY KEY (id),
  FOREIGN KEY (connection_id)       REFERENCES coparent_connections(id),
  FOREIGN KEY (child_id)            REFERENCES children(id),
  FOREIGN KEY (responsible_user_id) REFERENCES users(id),
  FOREIGN KEY (pickup_by_user_id)   REFERENCES users(id),
  FOREIGN KEY (dropoff_by_user_id)  REFERENCES users(id),
  FOREIGN KEY (created_by_user_id)  REFERENCES users(id),

  INDEX idx_ptr_child (child_id, is_active),
  INDEX idx_ptr_connection (connection_id, is_active),
  INDEX idx_ptr_effective (effective_from, effective_until),

  CONSTRAINT chk_ptr_pickup_weekday  CHECK (pickup_weekday  BETWEEN 1 AND 7),
  CONSTRAINT chk_ptr_dropoff_weekday CHECK (dropoff_weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_ptr_cadence         CHECK (cadence_weeks   BETWEEN 1 AND 8)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
