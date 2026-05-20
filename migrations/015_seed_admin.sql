-- ================================================================
-- 015_seed_admin.sql
-- Seed de demonstração para desenvolvimento local
--
-- Usuário principal : admin@admin.com   / 123456
-- Co-genitor        : maria@guardaapp.com / 123456
-- ================================================================

SET @user_a   = '11111111-1111-1111-1111-111111111111';
SET @user_b   = '22222222-2222-2222-2222-222222222222';
SET @conn_id  = '33333333-3333-3333-3333-333333333333';
SET @sophia   = '44444444-4444-4444-4444-444444444444';
SET @lucas    = '55555555-5555-5555-5555-555555555555';
SET @conv_id  = '66666666-6666-6666-6666-666666666666';

-- bcrypt cost 12 de "123456"
SET @hash_pwd = '$2a$12$IAx1kECtqg6LPRruHbI7peG/32O7ZKuwMwEWVMckpbM6LIk3bsIHO';

-- ── USUÁRIOS ─────────────────────────────────────────────────────

INSERT IGNORE INTO users
  (id, name, email, cpf, phone, password_hash, role, custody_type,
   email_verified_at, is_active, lgpd_version)
VALUES
  (@user_a,
   'Carlos Eduardo Silva', 'admin@admin.com',
   '529.982.247-25', '+5511987654321',
   @hash_pwd, 'pai', 'compartilhada',
   NOW() - INTERVAL 6 MONTH, 1, '1.2'),

  (@user_b,
   'Maria Fernanda Costa', 'maria@guardaapp.com',
   '871.869.450-06', '+5511912345678',
   @hash_pwd, 'mãe', 'compartilhada',
   NOW() - INTERVAL 6 MONTH, 1, '1.2');

-- ── PREFERÊNCIAS DE NOTIFICAÇÃO ──────────────────────────────────

INSERT IGNORE INTO notification_preferences (id, user_id, email_enabled, push_enabled)
VALUES
  (UUID(), @user_a, 1, 1),
  (UUID(), @user_b, 1, 1);

-- ── CONSENTIMENTOS LGPD ──────────────────────────────────────────

INSERT IGNORE INTO user_consents
  (id, user_id, consent_type, version, granted, granted_at, ip_address)
VALUES
  (UUID(), @user_a, 'terms_of_use',    '1.2', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_a, 'privacy_policy',  '1.2', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_a, 'marketing_email', '1.0', 0, NULL, NULL),
  (UUID(), @user_a, 'analytics',       '1.0', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_b, 'terms_of_use',    '1.2', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_b, 'privacy_policy',  '1.2', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_b, 'marketing_email', '1.0', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1'),
  (UUID(), @user_b, 'analytics',       '1.0', 1, NOW() - INTERVAL 6 MONTH, '127.0.0.1');

-- ── CONEXÃO DE CO-PARENTALIDADE ──────────────────────────────────

INSERT IGNORE INTO coparent_connections
  (id, user_id_a, user_id_b, invite_code, invite_email, status, accepted_at)
VALUES
  (@conn_id,
   @user_a, @user_b,
   'DEMO2026', 'maria@guardaapp.com',
   'active', NOW() - INTERVAL 6 MONTH);

-- ── FILHOS ───────────────────────────────────────────────────────

INSERT IGNORE INTO children
  (id, connection_id, name, birth_date, school, doctor, emoji, blood_type, notes)
VALUES
  (@sophia,
   @conn_id, 'Sophia Silva Costa', '2017-03-15',
   'Escola Municipal João XXIII', 'Dr. Ricardo Mendes',
   '👧', 'A+',
   'Alergia leve a amendoim. Usa óculos desde os 5 anos.'),

  (@lucas,
   @conn_id, 'Lucas Silva Costa', '2020-08-22',
   'CEI Criança Feliz', 'Dr. Ricardo Mendes',
   '👦', 'O+',
   'Gosta de dinossauros. Está aprendendo a nadar.');

-- ── CONVERSA ─────────────────────────────────────────────────────

INSERT IGNORE INTO conversations (id, connection_id)
VALUES (@conv_id, @conn_id);

-- ── MENSAGENS (cadeia de hashes SHA-256) ─────────────────────────

SET @m1_text = 'Oi Maria, podemos combinar a busca da Sophia para sexta às 18h?';
SET @m1_hash = SHA2(@m1_text, 256);

SET @m2_text = 'Oi Carlos! Pode ser, mas preciso sair do trabalho às 17h30. Pode ser 18h30?';
SET @m2_hash = SHA2(CONCAT(@m2_text, @m1_hash), 256);

SET @m3_text = 'Tudo bem, 18h30 está ótimo. Vou buscar no colégio mesmo.';
SET @m3_hash = SHA2(CONCAT(@m3_text, @m2_hash), 256);

SET @m4_text = 'A Sophia tem consulta na segunda às 15h com Dr. Ricardo. Você pode levar?';
SET @m4_hash = SHA2(CONCAT(@m4_text, @m3_hash), 256);

SET @m5_text = 'Tenho reunião de manhã, mas termino ao meio-dia. Posso levar sim.';
SET @m5_hash = SHA2(CONCAT(@m5_text, @m4_hash), 256);

SET @m6_text = 'Perfeito! Eu já agendei e confirmei com a clínica. Endereço: Rua das Palmeiras, 450.';
SET @m6_hash = SHA2(CONCAT(@m6_text, @m5_hash), 256);

SET @m7_text = 'Ótimo! Vou lembrar o Carlos do óculos da Sophia, ela esqueceu na semana passada.';
SET @m7_hash = SHA2(CONCAT(@m7_text, @m6_hash), 256);

SET @m8_text = 'Verdade, obrigado pelo lembrete. Já está na mochila dela.';
SET @m8_hash = SHA2(CONCAT(@m8_text, @m7_hash), 256);

INSERT IGNORE INTO messages
  (id, conversation_id, sender_id, text, hash, previous_hash, read_at, created_at)
VALUES
  (UUID(), @conv_id, @user_a, @m1_text, @m1_hash, NULL,
    NOW() - INTERVAL 10 DAY,
    NOW() - INTERVAL 10 DAY),

  (UUID(), @conv_id, @user_b, @m2_text, @m2_hash, @m1_hash,
    NOW() - INTERVAL 10 DAY,
    NOW() - INTERVAL 10 DAY + INTERVAL 5 MINUTE),

  (UUID(), @conv_id, @user_a, @m3_text, @m3_hash, @m2_hash,
    NOW() - INTERVAL 10 DAY,
    NOW() - INTERVAL 10 DAY + INTERVAL 8 MINUTE),

  (UUID(), @conv_id, @user_a, @m4_text, @m4_hash, @m3_hash,
    NOW() - INTERVAL 5 DAY,
    NOW() - INTERVAL 5 DAY),

  (UUID(), @conv_id, @user_b, @m5_text, @m5_hash, @m4_hash,
    NOW() - INTERVAL 5 DAY,
    NOW() - INTERVAL 5 DAY + INTERVAL 15 MINUTE),

  (UUID(), @conv_id, @user_a, @m6_text, @m6_hash, @m5_hash,
    NOW() - INTERVAL 5 DAY,
    NOW() - INTERVAL 5 DAY + INTERVAL 22 MINUTE),

  (UUID(), @conv_id, @user_b, @m7_text, @m7_hash, @m6_hash,
    NOW() - INTERVAL 2 DAY,
    NOW() - INTERVAL 2 DAY),

  (UUID(), @conv_id, @user_a, @m8_text, @m8_hash, @m7_hash,
    NULL,
    NOW() - INTERVAL 2 DAY + INTERVAL 30 MINUTE);

-- ── DESPESAS ─────────────────────────────────────────────────────

INSERT IGNORE INTO expenses
  (id, connection_id, child_id, submitted_by_id,
   title, description, category, amount, split_ratio,
   status, expense_date,
   approved_at,
   paid_at, payment_method,
   contested_by_id, contested_at)
VALUES
  -- Aprovada: Carlos submeteu, Maria aprovou
  (UUID(), @conn_id, @sophia, @user_a,
   'Consulta pediatra — Dr. Ricardo Mendes',
   'Consulta de rotina semestral. Incluído relatório de desenvolvimento.',
   'saúde', 350.00, '50/50',
   'approved', '2026-04-10',
   '2026-04-11 09:00:00',
   NULL, NULL,
   NULL, NULL),

  -- Pendente: Maria submeteu, aguardando Carlos
  (UUID(), @conn_id, @lucas, @user_b,
   'Material escolar 1º semestre 2026',
   'Lista completa de material do CEI Criança Feliz.',
   'educação', 480.00, '50/50',
   'pending', '2026-05-02',
   NULL,
   NULL, NULL,
   NULL, NULL),

  -- Paga: Carlos submeteu, Maria aprovou, Carlos pagou via PIX
  (UUID(), @conn_id, @lucas, @user_a,
   'Tênis Nike para o Lucas — número 26',
   'Pé cresceu 2 números em 4 meses. Urgente.',
   'vestuário', 120.00, '50/50',
   'paid', '2026-03-18',
   '2026-03-19 10:00:00',
   '2026-03-20 11:30:00', 'pix',
   NULL, NULL),

  -- Contestada: Maria submeteu, Carlos contestou
  (UUID(), @conn_id, @sophia, @user_b,
   'Psicólogo infantil — 4 sessões de abril',
   'Terapia cognitiva com Dra. Beatriz Nunes — adaptação escolar.',
   'saúde', 850.00, '50/50',
   'contested', '2026-04-30',
   NULL,
   NULL, NULL,
   @user_a, '2026-05-01 14:20:00'),

  -- Pendente: Carlos submeteu novo
  (UUID(), @conn_id, @sophia, @user_a,
   'Óculos de grau — Sophia',
   'Nova lente +1,75 OD e +1,25 OE. Armação incluída.',
   'saúde', 620.00, '50/50',
   'pending', '2026-05-12',
   NULL,
   NULL, NULL,
   NULL, NULL);

-- ── EVENTOS ──────────────────────────────────────────────────────

INSERT IGNORE INTO events
  (id, connection_id, child_id, created_by_user_id,
   title, description, location, category,
   event_date, start_time, end_time,
   status, confirmed_by_creator, confirmed_by_coparent)
VALUES
  -- Confirmado por ambos
  (UUID(), @conn_id, @sophia, @user_a,
   'Consulta pediátrica — Sophia',
   'Retorno com Dr. Ricardo Mendes. Trazer carteirinha de vacinas.',
   'Clínica Saúde Infantil — Rua das Palmeiras, 450',
   'saúde',
   DATE_ADD(CURDATE(), INTERVAL 3 DAY), '15:00:00', '16:00:00',
   'confirmed', 1, 1),

  -- Pendente de confirmação do Carlos
  (UUID(), @conn_id, @lucas, @user_b,
   'Reunião de pais — CEI Criança Feliz',
   'Reunião do 1º trimestre com as professoras da turma do Lucas.',
   'CEI Criança Feliz — Av. Brasil, 1200',
   'escola',
   DATE_ADD(CURDATE(), INTERVAL 7 DAY), '19:00:00', '20:30:00',
   'pending', 1, 0),

  -- Troca de guarda confirmada
  (UUID(), @conn_id, @sophia, @user_a,
   'Troca de guarda — Sophia',
   'Busca no colégio. Lembrar do estojo de arte.',
   'Escola Municipal João XXIII — portão lateral',
   'guarda',
   DATE_ADD(CURDATE(), INTERVAL 5 DAY), '18:30:00', '19:00:00',
   'confirmed', 1, 1),

  -- Aniversário — futuro
  (UUID(), @conn_id, @lucas, @user_a,
   'Aniversário de 6 anos do Lucas 🎉',
   'Festa no buffet. Tema: dinossauros. Confirmados 24 convidados.',
   'Buffet Alegria — Rua Primavera, 88',
   'lazer',
   '2026-08-22', '15:00:00', '19:00:00',
   'pending', 1, 0),

  -- Apresentação escolar confirmada
  (UUID(), @conn_id, @sophia, @user_b,
   'Apresentação de dança — Sophia',
   'Turma do 2º ano se apresenta no encerramento do 1º semestre.',
   'Escola Municipal João XXIII — Auditório',
   'escola',
   DATE_ADD(CURDATE(), INTERVAL 14 DAY), '18:00:00', '19:30:00',
   'confirmed', 1, 1),

  -- Troca de guarda passada (histórico)
  (UUID(), @conn_id, @lucas, @user_b,
   'Troca de guarda — Lucas',
   'Busca no CEI na sexta.',
   'CEI Criança Feliz',
   'guarda',
   DATE_SUB(CURDATE(), INTERVAL 7 DAY), '17:30:00', '18:00:00',
   'confirmed', 1, 1);

-- ── REGISTROS DE SAÚDE ───────────────────────────────────────────

INSERT IGNORE INTO health_entries
  (id, child_id, connection_id, created_by_id,
   type, title, entry_date, doctor, notes)
VALUES
  (UUID(), @sophia, @conn_id, @user_a,
   'consulta', 'Consulta pediátrica de rotina',
   '2026-04-10', 'Dr. Ricardo Mendes',
   'Desenvolvimento normal. Peso 22 kg, altura 1,20 m. Próxima consulta em outubro.'),

  (UUID(), @lucas, @conn_id, @user_b,
   'exame', 'Hemograma completo — rastreio anual',
   '2026-03-25', 'Dr. Ricardo Mendes',
   'Resultado dentro da normalidade. Hemoglobina 12,5 g/dL. Ferritina ok.'),

  (UUID(), @sophia, @conn_id, @user_b,
   'alergia', 'Episódio alérgico leve — amendoim',
   '2026-02-14', 'Dra. Ana Carvalho',
   'Ingeriu traços de amendoim acidentalmente. Urticária leve. Antihistamínico oral 5 mg. Prescrição de EpiPen para emergências.'),

  (UUID(), @lucas, @conn_id, @user_a,
   'consulta', 'Consulta de otorrinolaringologia',
   '2026-01-20', 'Dr. Fábio Pereira',
   'Verificação de otite recorrente. Sem infecção ativa. Indicado acompanhamento semestral.'),

  (UUID(), @sophia, @conn_id, @user_a,
   'medicacao', 'Início de colírio para astigmatismo',
   '2026-03-05', 'Dra. Paula Araújo — Oftalmologia',
   'Cyclopentolate 1% — 1 gota no OD ao dormir por 30 dias. Reavaliar em abril.');

-- ── VACINAS — SOPHIA ─────────────────────────────────────────────

SET @vac_s1 = UUID();
SET @vac_s2 = UUID();
SET @vac_s3 = UUID();
SET @vac_s4 = UUID();

INSERT IGNORE INTO vaccines
  (id, child_id, name, total_doses, doses_given, status, pni_code, next_due_date)
VALUES
  (@vac_s1, @sophia, 'Hepatite B',       3, 3, 'ok',      'HB',   NULL),
  (@vac_s2, @sophia, 'Tríplice Viral',   2, 2, 'ok',      'TTV',  NULL),
  (@vac_s3, @sophia, 'HPV Quadrivalente', 2, 1, 'pending', 'HPV', DATE_ADD(CURDATE(), INTERVAL 45 DAY)),
  (@vac_s4, @sophia, 'dTpa (reforço)',   1, 0, 'overdue', 'DTPA', DATE_SUB(CURDATE(), INTERVAL 30 DAY));

INSERT IGNORE INTO vaccine_doses
  (id, vaccine_id, dose_number, applied_date, applied_by, batch_number, registered_by_id)
VALUES
  (UUID(), @vac_s1, 1, '2017-03-20', 'Enf. Claudia — UBS Centro',         'HB2017A', @user_b),
  (UUID(), @vac_s1, 2, '2017-04-20', 'Enf. Claudia — UBS Centro',         'HB2017A', @user_b),
  (UUID(), @vac_s1, 3, '2017-09-15', 'Enf. Pedro — Clínica Bem Estar',    'HB2017B', @user_a),
  (UUID(), @vac_s2, 1, '2018-03-10', 'Enf. Claudia — UBS Centro',         'TTV2018',  @user_b),
  (UUID(), @vac_s2, 2, '2019-03-12', 'Enf. Claudia — UBS Centro',         'TTV2019',  @user_a),
  (UUID(), @vac_s3, 1, '2026-01-15', 'Enf. Ana — Clínica Saúde Infantil', 'HPV2025X', @user_a);

-- ── VACINAS — LUCAS ──────────────────────────────────────────────

SET @vac_l1 = UUID();
SET @vac_l2 = UUID();
SET @vac_l3 = UUID();
SET @vac_l4 = UUID();

INSERT IGNORE INTO vaccines
  (id, child_id, name, total_doses, doses_given, status, pni_code, next_due_date)
VALUES
  (@vac_l1, @lucas, 'Hepatite B',        3, 3, 'ok',      'HB',    NULL),
  (@vac_l2, @lucas, 'Pentavalente',      3, 3, 'ok',      'PENTA', NULL),
  (@vac_l3, @lucas, 'Varicela',          2, 1, 'pending', 'VAR',   DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
  (@vac_l4, @lucas, 'Meningocócica C',   3, 2, 'pending', 'MENC',  DATE_ADD(CURDATE(), INTERVAL 60 DAY));

INSERT IGNORE INTO vaccine_doses
  (id, vaccine_id, dose_number, applied_date, applied_by, batch_number, registered_by_id)
VALUES
  (UUID(), @vac_l1, 1, '2020-08-25', 'Enf. Claudia — UBS Centro',         'HB2020C',   @user_b),
  (UUID(), @vac_l1, 2, '2020-09-25', 'Enf. Claudia — UBS Centro',         'HB2020C',   @user_b),
  (UUID(), @vac_l1, 3, '2021-02-20', 'Enf. Pedro — Clínica Bem Estar',    'HB2021A',   @user_a),
  (UUID(), @vac_l2, 1, '2020-10-22', 'Enf. Claudia — UBS Centro',         'PENTA2020', @user_b),
  (UUID(), @vac_l2, 2, '2020-12-22', 'Enf. Claudia — UBS Centro',         'PENTA2020', @user_b),
  (UUID(), @vac_l2, 3, '2021-03-22', 'Enf. Claudia — UBS Centro',         'PENTA2021', @user_a),
  (UUID(), @vac_l3, 1, '2021-08-22', 'Enf. Ana — Clínica Saúde Infantil', 'VAR2021',   @user_a),
  (UUID(), @vac_l4, 1, '2021-09-22', 'Enf. Ana — Clínica Saúde Infantil', 'MENC2021',  @user_b),
  (UUID(), @vac_l4, 2, '2022-06-15', 'Enf. Pedro — Clínica Bem Estar',    'MENC2022',  @user_a);

-- ── MARCOS DE DESENVOLVIMENTO ────────────────────────────────────

INSERT IGNORE INTO milestones
  (id, child_id, connection_id, created_by_id,
   title, description, milestone_date, emoji)
VALUES
  (UUID(), @sophia, @conn_id, @user_b,
   'Primeira palavra: "mamãe"',
   'A Sophia falou "mamãe" claramente pela primeira vez enquanto brincávamos no tapete.',
   '2018-07-10', '💬'),

  (UUID(), @sophia, @conn_id, @user_a,
   'Primeiros passos',
   'Deu 4 passos seguidos sozinha no corredor de casa. Os dois estávamos lá pra ver!',
   '2018-09-22', '👣'),

  (UUID(), @sophia, @conn_id, @user_b,
   'Leu a primeira palavra sozinha',
   'Leu "BOLA" no livro de historinhas antes de dormir, sem que ninguém apontasse.',
   '2023-04-05', '📚'),

  (UUID(), @sophia, @conn_id, @user_a,
   'Aprendeu a andar de bicicleta',
   'Pedalou sozinha pela primeira vez no parque. Sem rodinhas!',
   '2024-08-11', '🚲'),

  (UUID(), @lucas, @conn_id, @user_a,
   'Primeiro sorriso social',
   'Sorriu de verdade para mim enquanto brincávamos de fazer caretas — não foi só gases!',
   '2020-10-18', '😊'),

  (UUID(), @lucas, @conn_id, @user_b,
   'Primeira palavra: "papá"',
   'Olhou direto para o Carlos e disse "papá" bem claro. Os dois choraram juntos.',
   '2021-11-03', '💬'),

  (UUID(), @lucas, @conn_id, @user_a,
   'Começou a andar',
   'Deu os primeiros passinhos firmes aos 16 meses. Agora literalmente não para.',
   '2021-12-20', '👣'),

  (UUID(), @lucas, @conn_id, @user_b,
   'Primeiro dia no CEI sem chorar',
   'Entrou na sala, deu tchau de longe e foi direto pra caixa de areia. Marco enorme!',
   '2023-02-07', '🏫');

-- ── TRILHA DE AUDITORIA ──────────────────────────────────────────

SET @a1_payload = '{"action":"user_registered","email":"admin@admin.com","role":"pai"}';
SET @a1_hash    = SHA2(CONCAT(@a1_payload, ''), 256);

SET @a2_payload = '{"action":"user_registered","email":"maria@guardaapp.com","role":"mae"}';
SET @a2_hash    = SHA2(CONCAT(@a2_payload, @a1_hash), 256);

SET @a3_payload = '{"action":"connection_accepted","code":"DEMO2026","user_a":"Carlos","user_b":"Maria"}';
SET @a3_hash    = SHA2(CONCAT(@a3_payload, @a2_hash), 256);

SET @a4_payload = '{"action":"child_created","name":"Sophia Silva Costa","birth_date":"2017-03-15"}';
SET @a4_hash    = SHA2(CONCAT(@a4_payload, @a3_hash), 256);

SET @a5_payload = '{"action":"child_created","name":"Lucas Silva Costa","birth_date":"2020-08-22"}';
SET @a5_hash    = SHA2(CONCAT(@a5_payload, @a4_hash), 256);

SET @a6_payload = '{"action":"expense_created","title":"Consulta pediatra","amount":350.00,"category":"saude"}';
SET @a6_hash    = SHA2(CONCAT(@a6_payload, @a5_hash), 256);

SET @a7_payload = '{"action":"expense_approved","title":"Consulta pediatra","approved_by":"Maria"}';
SET @a7_hash    = SHA2(CONCAT(@a7_payload, @a6_hash), 256);

INSERT IGNORE INTO audit_events
  (id, connection_id, actor_id,
   event_type, description, entity_type,
   hash, previous_hash, metadata, ip_address, created_at)
VALUES
  (UUID(), NULL,     @user_a,
   'login',    'Usuário admin@admin.com cadastrado na plataforma GuardaApp',
   'user',     @a1_hash, NULL,      @a1_payload, '127.0.0.1',
   NOW() - INTERVAL 6 MONTH),

  (UUID(), NULL,     @user_b,
   'login',    'Usuário maria@guardaapp.com cadastrado na plataforma GuardaApp',
   'user',     @a2_hash, @a1_hash,  @a2_payload, '127.0.0.1',
   NOW() - INTERVAL 6 MONTH + INTERVAL 2 HOUR),

  (UUID(), @conn_id, @user_b,
   'settings', 'Conexão de co-parentalidade estabelecida — código DEMO2026',
   'connection', @a3_hash, @a2_hash, @a3_payload, '127.0.0.1',
   NOW() - INTERVAL 6 MONTH + INTERVAL 3 HOUR),

  (UUID(), @conn_id, @user_a,
   'settings', 'Filho cadastrado: Sophia Silva Costa (2017-03-15)',
   'child',    @a4_hash, @a3_hash,  @a4_payload, '127.0.0.1',
   NOW() - INTERVAL 6 MONTH + INTERVAL 4 HOUR),

  (UUID(), @conn_id, @user_a,
   'settings', 'Filho cadastrado: Lucas Silva Costa (2020-08-22)',
   'child',    @a5_hash, @a4_hash,  @a5_payload, '127.0.0.1',
   NOW() - INTERVAL 6 MONTH + INTERVAL 4 HOUR + INTERVAL 5 MINUTE),

  (UUID(), @conn_id, @user_a,
   'expense',  'Despesa submetida: Consulta pediatra — R$ 350,00 (saúde)',
   'expense',  @a6_hash, @a5_hash,  @a6_payload, '127.0.0.1',
   NOW() - INTERVAL 40 DAY),

  (UUID(), @conn_id, @user_b,
   'expense',  'Despesa aprovada: Consulta pediatra — R$ 350,00',
   'expense',  @a7_hash, @a6_hash,  @a7_payload, '127.0.0.1',
   NOW() - INTERVAL 39 DAY);

-- ── NOTIFICAÇÕES ─────────────────────────────────────────────────

INSERT IGNORE INTO notifications
  (id, user_id, type, title, body, entity_type, created_at, read_at)
VALUES
  -- Para Carlos (user_a)
  (UUID(), @user_a, 'expense_submitted',
   'Nova despesa de Maria',
   'Maria submeteu uma despesa de R$ 480,00 — Material escolar 1º semestre 2026. Aguardando sua aprovação.',
   'expense', NOW() - INTERVAL 17 DAY, NOW() - INTERVAL 16 DAY),

  (UUID(), @user_a, 'expense_contested',
   'Despesa contestada',
   'A despesa "Psicólogo infantil — 4 sessões de abril" foi contestada. Verifique o motivo e responda.',
   'expense', NOW() - INTERVAL 3 DAY, NULL),

  (UUID(), @user_a, 'event_created',
   'Novo evento de Maria',
   'Maria criou o evento "Reunião de pais — CEI Criança Feliz". Confirme sua participação.',
   'event', NOW() - INTERVAL 2 DAY, NULL),

  (UUID(), @user_a, 'vaccine_due',
   'Vacina atrasada — Sophia',
   'A vacina dTpa (reforço) da Sophia está atrasada há 30 dias. Agende com urgência na UBS.',
   'vaccine', NOW() - INTERVAL 1 DAY, NULL),

  (UUID(), @user_a, 'new_message',
   'Nova mensagem de Maria',
   'Maria: "Ótimo! Vou lembrar o Carlos do óculos da Sophia, ela esqueceu na semana passada."',
   'message', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 1 HOUR),

  -- Para Maria (user_b)
  (UUID(), @user_b, 'expense_approved',
   'Despesa aprovada por Carlos',
   'Carlos aprovou sua despesa de R$ 350,00 — Consulta pediatra Dr. Ricardo Mendes.',
   'expense', NOW() - INTERVAL 39 DAY, NOW() - INTERVAL 38 DAY),

  (UUID(), @user_b, 'event_confirmed',
   'Evento confirmado por Carlos',
   'Carlos confirmou o evento "Troca de guarda — Sophia" para esta semana.',
   'event', NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 4 DAY + INTERVAL 2 HOUR),

  (UUID(), @user_b, 'expense_submitted',
   'Nova despesa de Carlos',
   'Carlos submeteu uma despesa de R$ 620,00 — Óculos de grau para Sophia. Aguardando sua aprovação.',
   'expense', NOW() - INTERVAL 7 DAY, NULL),

  (UUID(), @user_b, 'vaccine_due',
   'Vacina pendente — Lucas',
   'A 2ª dose da vacina Varicela do Lucas vence em 30 dias. Agende com antecedência.',
   'vaccine', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 4 DAY);
