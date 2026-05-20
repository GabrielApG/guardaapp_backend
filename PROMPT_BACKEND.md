# GuardaApp — Especificação Completa de Backend

> **Stack:** Node.js 20 LTS · Express 4 · MySQL 8 · MinIO · Swagger/OpenAPI 3.0  
> **Timezone:** America/Sao_Paulo  
> **Moeda:** BRL  
> **Testes:** não incluídos nesta fase  
> **Conformidade:** LGPD (Lei nº 13.709/2018)

---

## 1. VISÃO GERAL DO PROJETO

GuardaApp é uma plataforma de co-parentalidade para pais separados ou divorciados no Brasil. O backend deve suportar:

- Autenticação segura com JWT + refresh token
- Comunicação mediada e auditável entre co-parentes
- Calendário compartilhado com confirmação bilateral
- Controle de despesas com fluxo de aprovação
- Cofre de documentos criptografados (via MinIO)
- Histórico de saúde e carteira de vacinação (PNI)
- Diário de marcos da criança
- Trilha de auditoria append-only com hash SHA-256 encadeado
- Conformidade total com LGPD

---

## 2. ESTRUTURA DE PASTAS DO PROJETO

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # Conexão MySQL (mysql2/promise)
│   │   ├── minio.js             # Cliente MinIO
│   │   ├── jwt.js               # Segredos e helpers JWT
│   │   └── swagger.js           # Configuração Swagger UI
│   ├── middleware/
│   │   ├── auth.js              # Verificar JWT, extrair userId
│   │   ├── coparent.js          # Verificar que os dois usuários têm conexão ativa
│   │   ├── rateLimiter.js       # express-rate-limit por IP e por userId
│   │   ├── auditLogger.js       # Intercepta todas as escritas e gera AuditEvent
│   │   └── errorHandler.js      # Handler global de erros com resposta padronizada
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── children.js
│   │   ├── coparent.js
│   │   ├── events.js
│   │   ├── messages.js
│   │   ├── expenses.js
│   │   ├── documents.js
│   │   ├── health.js
│   │   ├── vaccines.js
│   │   ├── milestones.js
│   │   ├── audit.js
│   │   ├── notifications.js
│   │   └── lgpd.js
│   ├── controllers/             # Lógica de cada rota
│   ├── services/
│   │   ├── hashChain.js         # SHA-256 encadeado para auditoria
│   │   ├── hostilityFilter.js   # Análise de linguagem hostil
│   │   ├── pdfExport.js         # Gerar PDF assinado (pdfkit)
│   │   └── storage.js           # Upload/download MinIO
│   ├── utils/
│   │   ├── paginate.js
│   │   ├── formatBRL.js
│   │   └── cpfValidator.js
│   └── app.js                   # Express app principal
├── migrations/                  # Scripts SQL em ordem numerada
│   ├── 001_create_users.sql
│   ├── 002_create_coparent_connections.sql
│   ├── 003_create_children.sql
│   ├── 004_create_events.sql
│   ├── 005_create_messages.sql
│   ├── 006_create_expenses.sql
│   ├── 007_create_documents.sql
│   ├── 008_create_health.sql
│   ├── 009_create_vaccines.sql
│   ├── 010_create_milestones.sql
│   ├── 011_create_audit.sql
│   ├── 012_create_notifications.sql
│   ├── 013_create_consents.sql
│   └── 014_create_sessions.sql
├── .env.example
├── package.json
└── server.js                    # Entrypoint
```

---

## 3. VARIÁVEIS DE AMBIENTE (.env)

```env
# Servidor
PORT=3000
NODE_ENV=development
TZ=America/Sao_Paulo

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=guardaapp
DB_USER=root
DB_PASSWORD=senha_segura
DB_POOL_MIN=2
DB_POOL_MAX=10

# JWT
JWT_SECRET=chave_secreta_longa_aleatoria
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=chave_refresh_longa
JWT_REFRESH_EXPIRES_IN=30d

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_DOCUMENTS=guardaapp-docs
MINIO_BUCKET_AVATARS=guardaapp-avatars
MINIO_BUCKET_RECEIPTS=guardaapp-receipts
MINIO_BUCKET_MILESTONES=guardaapp-milestones

# Hash de auditoria
AUDIT_CHAIN_SECRET=segredo_para_hmac_auditoria

# PDF
PDF_SIGNER_NAME=GuardaApp Plataforma
PDF_SIGNER_CONTACT=juridico@guardaapp.com.br

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## 4. BANCO DE DADOS MYSQL — SCHEMA COMPLETO

### 4.1 Tabela: `users`

```sql
CREATE TABLE users (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  name          VARCHAR(150)    NOT NULL,
  email         VARCHAR(255)    NOT NULL UNIQUE,
  cpf           VARCHAR(14)     NOT NULL UNIQUE COMMENT 'Formato: 000.000.000-00',
  phone         VARCHAR(20)     NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM(
                  'pai','mãe','responsável legal',
                  'avô','avó','outro'
                )               NOT NULL DEFAULT 'pai',
  custody_type  ENUM(
                  'compartilhada','unilateral',
                  'alternada','sem definição formal'
                )               NULL,
  avatar_url    VARCHAR(500)    NULL COMMENT 'Chave MinIO no bucket avatars',
  email_verified_at  DATETIME   NULL,
  email_verify_token VARCHAR(64) NULL,
  reset_token   VARCHAR(64)     NULL,
  reset_token_expires_at DATETIME NULL,
  low_conflict_mode   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Modo Baixo Conflito ativo',
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  lgpd_version  VARCHAR(10)     NOT NULL DEFAULT '1.2' COMMENT 'Versão dos termos aceitos',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME        NULL COMMENT 'Soft delete LGPD',
  PRIMARY KEY (id),
  INDEX idx_email (email),
  INDEX idx_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 Tabela: `user_sessions`

```sql
CREATE TABLE user_sessions (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)     NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt do refresh token',
  device_name   VARCHAR(100)    NULL COMMENT 'Ex: iPhone 14 Pro',
  device_os     VARCHAR(50)     NULL COMMENT 'Ex: iOS 17.4',
  ip_address    VARCHAR(45)     NULL,
  location      VARCHAR(100)    NULL COMMENT 'Cidade/UF estimada por IP',
  last_seen_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME        NOT NULL,
  revoked_at    DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_sessions (user_id),
  INDEX idx_refresh_token (refresh_token_hash(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.3 Tabela: `coparent_connections`

```sql
CREATE TABLE coparent_connections (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id_a       VARCHAR(36)   NOT NULL COMMENT 'Quem enviou o convite',
  user_id_b       VARCHAR(36)   NOT NULL COMMENT 'Quem aceitou',
  invite_code     VARCHAR(12)   NOT NULL UNIQUE COMMENT 'Código de 8 chars para aceite',
  invite_email    VARCHAR(255)  NULL COMMENT 'E-mail para onde o convite foi enviado',
  status          ENUM('pending','active','suspended','terminated') NOT NULL DEFAULT 'pending',
  protective_order TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Medida protetiva ativa',
  accepted_at     DATETIME      NULL,
  terminated_at   DATETIME      NULL,
  terminated_reason TEXT        NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id_a) REFERENCES users(id),
  FOREIGN KEY (user_id_b) REFERENCES users(id),
  INDEX idx_invite_code (invite_code),
  INDEX idx_users_connection (user_id_a, user_id_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.4 Tabela: `children`

```sql
CREATE TABLE children (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)     NOT NULL,
  name          VARCHAR(150)    NOT NULL,
  birth_date    DATE            NOT NULL,
  school        VARCHAR(200)    NULL,
  doctor        VARCHAR(200)    NULL,
  avatar_url    VARCHAR(500)    NULL,
  emoji         VARCHAR(10)     NOT NULL DEFAULT '👧',
  blood_type    VARCHAR(5)      NULL COMMENT 'Ex: A+, O-',
  notes         TEXT            NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.5 Tabela: `events`

```sql
CREATE TABLE events (
  id                   VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  connection_id        VARCHAR(36)  NOT NULL,
  child_id             VARCHAR(36)  NOT NULL,
  created_by_user_id   VARCHAR(36)  NOT NULL,
  title                VARCHAR(200) NOT NULL,
  description          TEXT         NULL,
  location             VARCHAR(300) NULL,
  category             ENUM('escola','saúde','lazer','guarda','outros') NOT NULL,
  event_date           DATE         NOT NULL,
  start_time           TIME         NULL,
  end_time             TIME         NULL,
  recurrence           ENUM('none','daily','weekly','biweekly','monthly') NOT NULL DEFAULT 'none',
  recurrence_end_date  DATE         NULL,
  status               ENUM('pending','confirmed','conflict','cancelled') NOT NULL DEFAULT 'pending',
  confirmed_by_creator   TINYINT(1) NOT NULL DEFAULT 1,
  confirmed_by_coparent  TINYINT(1) NOT NULL DEFAULT 0,
  parent_event_id      VARCHAR(36)  NULL COMMENT 'Para eventos recorrentes',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME     NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  INDEX idx_event_date (event_date),
  INDEX idx_connection_events (connection_id, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.6 Tabela: `conversations`

```sql
CREATE TABLE conversations (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)     NOT NULL UNIQUE COMMENT 'Uma conversa por conexão de co-parente',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.7 Tabela: `messages`

```sql
CREATE TABLE messages (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  conversation_id VARCHAR(36)   NOT NULL,
  sender_id       VARCHAR(36)   NOT NULL,
  text            TEXT          NOT NULL,
  hash            VARCHAR(64)   NOT NULL COMMENT 'SHA-256 do conteúdo + hash anterior',
  previous_hash   VARCHAR(64)   NULL COMMENT 'Hash da mensagem anterior (blockchain simples)',
  is_hostile      TINYINT(1)    NOT NULL DEFAULT 0,
  hostile_score   DECIMAL(4,3)  NULL,
  read_at         DATETIME      NULL COMMENT 'Quando o co-parente leu',
  deleted_at      DATETIME      NULL COMMENT 'Soft delete — mantém hash na cadeia',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  INDEX idx_conversation_messages (conversation_id, created_at),
  INDEX idx_hash (hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.8 Tabela: `message_attachments`

```sql
CREATE TABLE message_attachments (
  id          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  message_id  VARCHAR(36)   NOT NULL,
  file_name   VARCHAR(255)  NOT NULL,
  file_type   ENUM('image','pdf') NOT NULL,
  minio_key   VARCHAR(500)  NOT NULL,
  size_bytes  BIGINT        NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.9 Tabela: `expenses`

```sql
CREATE TABLE expenses (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  connection_id   VARCHAR(36)     NOT NULL,
  child_id        VARCHAR(36)     NOT NULL,
  submitted_by_id VARCHAR(36)     NOT NULL,
  title           VARCHAR(200)    NOT NULL,
  description     TEXT            NULL,
  category        ENUM('saúde','educação','lazer','vestuário','outros') NOT NULL,
  amount          DECIMAL(10,2)   NOT NULL,
  split_ratio     ENUM('50/50','70/30','30/70','100/0','0/100') NOT NULL DEFAULT '50/50',
  status          ENUM('pending','approved','contested','paid','cancelled') NOT NULL DEFAULT 'pending',
  receipt_minio_key VARCHAR(500)  NULL,
  receipt_name    VARCHAR(255)    NULL,
  contest_reason  TEXT            NULL,
  contested_by_id VARCHAR(36)     NULL,
  contested_at    DATETIME        NULL,
  approved_at     DATETIME        NULL,
  paid_at         DATETIME        NULL,
  payment_method  ENUM('pix','transferencia','dinheiro','outro') NULL,
  payment_receipt_minio_key VARCHAR(500) NULL,
  expense_date    DATE            NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (submitted_by_id) REFERENCES users(id),
  FOREIGN KEY (contested_by_id) REFERENCES users(id),
  INDEX idx_connection_expenses (connection_id, status),
  INDEX idx_expense_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.10 Tabela: `documents`

```sql
CREATE TABLE documents (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  connection_id   VARCHAR(36)     NOT NULL,
  uploaded_by_id  VARCHAR(36)     NOT NULL,
  name            VARCHAR(255)    NOT NULL,
  description     TEXT            NULL,
  category        ENUM('juridico','escola','saude','geral') NOT NULL DEFAULT 'geral',
  file_type       ENUM('pdf','image') NOT NULL,
  minio_key       VARCHAR(500)    NOT NULL COMMENT 'Chave no bucket documents',
  size_bytes      BIGINT          NOT NULL,
  checksum_sha256 VARCHAR(64)     NOT NULL COMMENT 'Integridade do arquivo',
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME        NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (uploaded_by_id) REFERENCES users(id),
  INDEX idx_connection_docs (connection_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.11 Tabela: `document_access_log`

```sql
CREATE TABLE document_access_log (
  id          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  document_id VARCHAR(36)   NOT NULL,
  user_id     VARCHAR(36)   NOT NULL,
  action      ENUM('view','download','share') NOT NULL DEFAULT 'view',
  ip_address  VARCHAR(45)   NULL,
  accessed_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.12 Tabela: `health_entries`

```sql
CREATE TABLE health_entries (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id      VARCHAR(36)   NOT NULL,
  connection_id VARCHAR(36)   NOT NULL,
  created_by_id VARCHAR(36)   NOT NULL,
  type          ENUM('consulta','vacina','medicacao','exame','alergia') NOT NULL,
  title         VARCHAR(200)  NOT NULL,
  entry_date    DATE          NOT NULL,
  doctor        VARCHAR(200)  NULL,
  notes         TEXT          NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  INDEX idx_child_health (child_id, entry_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.13 Tabela: `vaccines`

```sql
CREATE TABLE vaccines (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id      VARCHAR(36)   NOT NULL,
  name          VARCHAR(150)  NOT NULL COMMENT 'Nome conforme PNI',
  total_doses   INT           NOT NULL DEFAULT 1,
  doses_given   INT           NOT NULL DEFAULT 0,
  next_due_date DATE          NULL,
  status        ENUM('ok','pending','overdue') NOT NULL DEFAULT 'pending',
  pni_code      VARCHAR(20)   NULL COMMENT 'Código PNI oficial',
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  INDEX idx_child_vaccines (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.14 Tabela: `vaccine_doses`

```sql
CREATE TABLE vaccine_doses (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  vaccine_id      VARCHAR(36)   NOT NULL,
  dose_number     INT           NOT NULL,
  applied_date    DATE          NOT NULL,
  applied_by      VARCHAR(200)  NULL COMMENT 'UBS ou clínica',
  batch_number    VARCHAR(50)   NULL COMMENT 'Número do lote',
  registered_by_id VARCHAR(36)  NOT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (vaccine_id) REFERENCES vaccines(id) ON DELETE CASCADE,
  FOREIGN KEY (registered_by_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.15 Tabela: `milestones`

```sql
CREATE TABLE milestones (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  child_id        VARCHAR(36)   NOT NULL,
  connection_id   VARCHAR(36)   NOT NULL,
  created_by_id   VARCHAR(36)   NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  description     TEXT          NULL,
  milestone_date  DATE          NOT NULL,
  emoji           VARCHAR(10)   NOT NULL DEFAULT '🌟',
  photo_minio_key VARCHAR(500)  NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  INDEX idx_child_milestones (child_id, milestone_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.16 Tabela: `milestone_comments`

```sql
CREATE TABLE milestone_comments (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  milestone_id  VARCHAR(36)   NOT NULL,
  author_id     VARCHAR(36)   NOT NULL,
  text          VARCHAR(500)  NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.17 Tabela: `audit_events`

```sql
CREATE TABLE audit_events (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NULL COMMENT 'NULL = evento de sistema',
  actor_id      VARCHAR(36)   NOT NULL,
  event_type    ENUM(
                  'message','expense','event','document',
                  'decision','login','logout','health',
                  'vaccine','milestone','settings','lgpd'
                )             NOT NULL,
  description   TEXT          NOT NULL,
  entity_type   VARCHAR(50)   NULL COMMENT 'Ex: messages, expenses',
  entity_id     VARCHAR(36)   NULL,
  hash          VARCHAR(64)   NOT NULL COMMENT 'SHA-256 do evento + hash anterior',
  previous_hash VARCHAR(64)   NULL,
  metadata      JSON          NULL COMMENT 'Dados extras do evento',
  ip_address    VARCHAR(45)   NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_connection_audit (connection_id, created_at DESC),
  INDEX idx_hash_chain (hash),
  INDEX idx_actor_audit (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.18 Tabela: `notifications`

```sql
CREATE TABLE notifications (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)   NOT NULL,
  type          ENUM(
                  'new_message','expense_submitted','expense_approved',
                  'expense_contested','expense_paid','event_created',
                  'event_confirmed','event_conflict','document_uploaded',
                  'milestone_comment','vaccine_due','coparent_invite'
                )             NOT NULL,
  title         VARCHAR(200)  NOT NULL,
  body          TEXT          NOT NULL,
  entity_type   VARCHAR(50)   NULL,
  entity_id     VARCHAR(36)   NULL COMMENT 'ID do objeto relacionado',
  read_at       DATETIME      NULL,
  push_sent_at  DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_notifications (user_id, read_at, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.19 Tabela: `user_consents`

```sql
CREATE TABLE user_consents (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)   NOT NULL,
  consent_type  ENUM(
                  'terms_of_use','privacy_policy',
                  'marketing_email','analytics'
                )             NOT NULL,
  version       VARCHAR(10)   NOT NULL COMMENT 'Versão do documento aceito',
  granted       TINYINT(1)    NOT NULL DEFAULT 0,
  granted_at    DATETIME      NULL,
  revoked_at    DATETIME      NULL,
  ip_address    VARCHAR(45)   NULL,
  user_agent    VARCHAR(300)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_consent_type (user_id, consent_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 5. CONFIGURAÇÃO MINIO

### Buckets necessários

| Bucket                   | Conteúdo                              | Acesso |
|--------------------------|---------------------------------------|--------|
| `guardaapp-avatars`      | Fotos de perfil de usuários e filhos  | Privado com presigned URL |
| `guardaapp-documents`    | Documentos do cofre (PDF/imagem)      | Privado com presigned URL |
| `guardaapp-receipts`     | Comprovantes de despesas              | Privado com presigned URL |
| `guardaapp-milestones`   | Fotos do diário de marcos             | Privado com presigned URL |
| `guardaapp-exports`      | PDFs exportados assinados (TTL 24h)   | Privado com presigned URL |

### Política de presigned URLs
- Validade padrão: **1 hora**
- PDFs de exportação: **24 horas**
- O backend nunca expõe a URL permanente do MinIO, sempre gera presigned URL no momento do request

---

## 6. PADRÕES GERAIS DE API

### Base URL
```
https://api.guardaapp.com.br/v1
```

### Headers obrigatórios em rotas autenticadas
```
Authorization: Bearer <access_token>
Content-Type: application/json
X-Device-Id: <uuid-do-dispositivo>     (opcional, para rastrear sessão)
```

### Formato de resposta padrão

**Sucesso:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "perPage": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Erro:**
```json
{
  "success": false,
  "error": {
    "code": "EXPENSE_NOT_FOUND",
    "message": "Despesa não encontrada.",
    "details": []
  }
}
```

### Códigos de erro padronizados

| Código HTTP | Código de erro           | Significado |
|-------------|--------------------------|-------------|
| 400         | VALIDATION_ERROR         | Campos inválidos |
| 401         | UNAUTHORIZED             | Token ausente ou expirado |
| 403         | FORBIDDEN                | Sem permissão para o recurso |
| 404         | NOT_FOUND                | Recurso não encontrado |
| 409         | CONFLICT                 | Estado inválido para a operação |
| 422         | UNPROCESSABLE            | Regra de negócio violada |
| 429         | RATE_LIMIT               | Muitas requisições |
| 500         | INTERNAL_ERROR           | Erro interno |

---

## 7. ESPECIFICAÇÃO DETALHADA DAS APIs

---

### MODULE: AUTH `/auth`

---

#### `POST /auth/register`
Cadastro de novo usuário.

**Request body:**
```json
{
  "name": "Gabriel Santos",
  "email": "gabriel@email.com",
  "cpf": "123.456.789-00",
  "phone": "+55 11 99999-0001",
  "password": "SenhaSegura@123",
  "role": "pai",
  "consents": {
    "terms_of_use": true,
    "privacy_policy": true,
    "marketing_email": false,
    "analytics": false
  }
}
```

**Validações:**
- `name`: obrigatório, mín 3 chars
- `email`: formato válido, único
- `cpf`: formato `000.000.000-00`, válido (algoritmo), único
- `password`: mín 8 chars, ao menos 1 maiúscula, 1 número
- `consents.terms_of_use` e `consents.privacy_policy`: obrigatoriamente `true`

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "Gabriel Santos",
      "email": "gabriel@email.com",
      "role": "pai",
      "emailVerified": false
    },
    "message": "Verifique seu e-mail para ativar a conta."
  }
}
```

**Ações internas:**
1. Hash da senha com bcrypt (cost 12)
2. Gerar `email_verify_token` (crypto.randomBytes(32))
3. Enviar e-mail de verificação
4. Registrar consentimentos em `user_consents`
5. Criar evento de auditoria `settings` — "Conta criada"

---

#### `POST /auth/verify-email`
Verificar token de e-mail.

**Request body:**
```json
{
  "token": "abc123def456...",
  "code": "123456"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "uuid", "name": "Gabriel Santos", "emailVerified": true }
  }
}
```

---

#### `POST /auth/login`
**Request body:**
```json
{
  "email": "gabriel@email.com",
  "password": "SenhaSegura@123",
  "deviceName": "iPhone 14 Pro",
  "deviceOs": "iOS 17.4"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "name": "Gabriel Santos",
      "email": "gabriel@email.com",
      "role": "pai",
      "custodyType": "compartilhada",
      "avatarUrl": "https://presigned-url...",
      "emailVerified": true,
      "lowConflictMode": false,
      "hasConnection": true,
      "hasChildren": true,
      "setupCompleted": true
    }
  }
}
```

**Ações internas:**
1. Verificar senha com bcrypt
2. Criar registro em `user_sessions`
3. Retornar access token (JWT, 15min) + refresh token (JWT, 30d)
4. Auditoria: `login` — "Acesso ao app"

---

#### `POST /auth/refresh`
Renovar access token.

**Request body:**
```json
{ "refreshToken": "eyJ..." }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "expiresIn": 900
  }
}
```

---

#### `POST /auth/logout`
Revogar sessão atual.

**Auth:** requerida

**Response 200:**
```json
{ "success": true, "data": { "message": "Sessão encerrada com sucesso." } }
```

---

#### `POST /auth/forgot-password`
**Request body:**
```json
{ "email": "gabriel@email.com" }
```

**Response 200:** (sempre retorna sucesso para não vazar existência de e-mail)
```json
{
  "success": true,
  "data": {
    "message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve.",
    "protocol": "GA-2026-A1B2C3"
  }
}
```

---

#### `POST /auth/reset-password`
**Request body:**
```json
{
  "token": "abc123...",
  "password": "NovaSenha@456",
  "confirmPassword": "NovaSenha@456"
}
```

**Response 200:**
```json
{ "success": true, "data": { "message": "Senha alterada com sucesso. Todas as sessões foram encerradas." } }
```

---

### MODULE: USERS `/users`

---

#### `GET /users/me`
Perfil completo do usuário autenticado.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Gabriel Santos",
    "email": "gabriel@email.com",
    "cpf": "123.456.789-00",
    "phone": "+55 11 99999-0001",
    "role": "pai",
    "custodyType": "compartilhada",
    "avatarUrl": "https://presigned-url...",
    "lowConflictMode": false,
    "emailVerified": true,
    "createdAt": "2024-11-10T14:30:00Z"
  }
}
```

---

#### `PUT /users/me`
Atualizar perfil.

**Request body (todos opcionais):**
```json
{
  "name": "Gabriel Santos",
  "phone": "+55 11 99999-0001",
  "role": "pai",
  "custodyType": "compartilhada"
}
```

**Response 200:** retorna usuário atualizado (mesmo shape de `GET /users/me`)

---

#### `POST /users/me/avatar`
Upload de foto de perfil.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `avatar` (file): JPEG ou PNG, máx 5MB

**Response 200:**
```json
{
  "success": true,
  "data": { "avatarUrl": "https://presigned-url..." }
}
```

---

#### `PUT /users/me/password`
Alterar senha (requer senha atual).

**Request body:**
```json
{
  "currentPassword": "SenhaAtual@123",
  "newPassword": "NovaSenha@456",
  "confirmPassword": "NovaSenha@456"
}
```

**Response 200:**
```json
{ "success": true, "data": { "message": "Senha alterada. Todas as outras sessões foram encerradas." } }
```

---

#### `PUT /users/me/low-conflict`
Ativar/desativar Modo Baixo Conflito.

**Request body:**
```json
{ "enabled": true }
```

**Response 200:**
```json
{ "success": true, "data": { "lowConflictMode": true } }
```

---

#### `GET /users/me/sessions`
Listar sessões ativas.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "deviceName": "iPhone 14 Pro",
      "deviceOs": "iOS 17.4",
      "location": "São Paulo, SP",
      "lastSeenAt": "2026-05-19T17:32:00Z",
      "isCurrent": true
    }
  ]
}
```

---

#### `DELETE /users/me/sessions/:sessionId`
Revogar sessão específica.

**Response 200:**
```json
{ "success": true, "data": { "message": "Sessão encerrada." } }
```

---

### MODULE: CO-PARENT `/coparent`

---

#### `POST /coparent/invite`
Enviar convite para co-parente.

**Request body:**
```json
{
  "email": "ana@email.com",
  "mode": "email"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "inviteCode": "GUARDA-A1B2",
    "inviteEmail": "ana@email.com",
    "expiresAt": "2026-05-26T17:32:00Z"
  }
}
```

---

#### `POST /coparent/accept`
Aceitar convite pelo código.

**Request body:**
```json
{ "inviteCode": "GUARDA-A1B2" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "coParent": {
      "id": "uuid",
      "name": "Ana Lima",
      "email": "ana@email.com",
      "role": "mãe"
    }
  }
}
```

---

#### `GET /coparent/connection`
Dados da conexão e co-parente.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "connectionId": "uuid",
    "status": "active",
    "protectiveOrder": false,
    "acceptedAt": "2024-11-10T14:30:00Z",
    "coParent": {
      "id": "uuid",
      "name": "Ana Lima",
      "role": "mãe",
      "avatarUrl": "https://presigned-url...",
      "phone": "+55 11 99999-0002"
    }
  }
}
```

---

### MODULE: CHILDREN `/children`

---

#### `GET /children`
Listar filhos da conexão.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Helena Santos",
      "birthDate": "2018-03-15",
      "age": 8,
      "school": "Escola Municipal Monteiro Lobato",
      "doctor": "Dra. Carla Mendes",
      "avatarUrl": null,
      "emoji": "👧",
      "bloodType": null
    }
  ]
}
```

---

#### `POST /children`
Cadastrar filho.

**Request body:**
```json
{
  "name": "Helena Santos",
  "birthDate": "2018-03-15",
  "school": "Escola Municipal Monteiro Lobato",
  "doctor": "Dra. Carla Mendes",
  "emoji": "👧",
  "bloodType": "A+"
}
```

**Response 201:** retorna filho criado (mesmo shape do GET)

---

#### `PUT /children/:id`
Atualizar dados do filho (todos campos opcionais).

**Response 200:** retorna filho atualizado

---

### MODULE: EVENTS `/events`

---

#### `GET /events`
Listar eventos. Suporta filtro por período.

**Query params:**
- `startDate` (YYYY-MM-DD) — obrigatório
- `endDate` (YYYY-MM-DD) — obrigatório
- `childId` — opcional
- `category` — opcional

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Consulta pediatra",
      "description": "Consulta de rotina semestral.",
      "location": "Clínica Saúde Criança — Sala 3",
      "category": "saúde",
      "eventDate": "2026-05-23",
      "startTime": "10:00",
      "endTime": null,
      "recurrence": "none",
      "status": "confirmed",
      "confirmedByCreator": true,
      "confirmedByCoparent": true,
      "createdBy": {
        "id": "uuid",
        "name": "Gabriel Santos"
      },
      "child": {
        "id": "uuid",
        "name": "Helena Santos"
      }
    }
  ]
}
```

---

#### `POST /events`
Criar evento.

**Request body:**
```json
{
  "childId": "uuid",
  "title": "Consulta pediatra",
  "description": "Consulta de rotina semestral. Levar caderneta.",
  "location": "Clínica Saúde Criança",
  "category": "saúde",
  "eventDate": "2026-05-23",
  "startTime": "10:00",
  "endTime": "11:00",
  "recurrence": "none",
  "recurrenceEndDate": null
}
```

**Response 201:** retorna evento criado

**Ações internas:**
1. Criar evento com `status = 'pending'`, `confirmedByCreator = true`
2. Notificar co-parente: `event_created`
3. Auditoria: `event` — "Evento criado"

---

#### `GET /events/:id`
Detalhe de um evento.

**Response 200:** shape completo do evento (igual ao GET /events mas objeto único)

---

#### `PUT /events/:id`
Atualizar evento (criador apenas).

**Request body:** mesmos campos do POST, todos opcionais.

**Response 200:** retorna evento atualizado com nova notificação ao co-parente.

---

#### `POST /events/:id/confirm`
Co-parente confirma presença.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "confirmed",
    "confirmedByCoparent": true
  }
}
```

---

#### `DELETE /events/:id`
Cancelar evento (soft delete).

**Response 200:**
```json
{ "success": true, "data": { "message": "Evento cancelado." } }
```

---

### MODULE: MESSAGES `/messages`

---

#### `GET /messages/conversations`
Listar conversas do usuário.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "coParent": {
        "id": "uuid",
        "name": "Ana Lima",
        "avatarUrl": null,
        "isAnonymous": false
      },
      "lastMessage": "Ok, pode trazer a Helena às 19h.",
      "lastMessageAt": "2026-05-19T17:20:00Z",
      "unreadCount": 2
    }
  ]
}
```

---

#### `GET /messages/conversations/:id`
Mensagens de uma conversa. Paginadas.

**Query params:**
- `page` (default 1)
- `perPage` (default 30)
- `before` — ISO timestamp (paginação infinita)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "senderId": "uuid",
      "isMe": true,
      "text": "Oi Ana, tudo bem?",
      "hash": "a3f2c1d9...",
      "isFlaggedHostile": false,
      "readAt": "2026-05-19T17:22:00Z",
      "createdAt": "2026-05-19T17:00:00Z",
      "attachments": []
    }
  ],
  "meta": { "page": 1, "perPage": 30, "total": 45 }
}
```

---

#### `POST /messages/conversations/:id`
Enviar mensagem.

**Request body:**
```json
{
  "text": "Oi Ana, tudo bem?",
  "checkHostility": true
}
```

**Response 201 (mensagem não hostil):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "text": "Oi Ana, tudo bem?",
    "hash": "a3f2c1d9...",
    "isFlaggedHostile": false,
    "createdAt": "2026-05-19T17:00:00Z"
  }
}
```

**Response 200 (hostil detectada — NÃO bloqueia, apenas avisa):**
```json
{
  "success": true,
  "data": {
    "hostile": true,
    "suggestion": "Sua mensagem pode ser interpretada de forma hostil. Considere reformular.",
    "message": null
  }
}
```

O cliente exibe o aviso e o usuário escolhe enviar mesmo assim (reenviar com `force: true`).

**Request body com force:**
```json
{
  "text": "Texto com linguagem hostil",
  "checkHostility": true,
  "force": true
}
```

**Ações internas:**
1. Calcular hash SHA-256 (`content + previousHash + timestamp`)
2. Salvar `is_hostile` e `hostile_score`
3. Notificar co-parente: `new_message`
4. Auditoria: `message`

---

#### `POST /messages/conversations/:id/attachments`
Upload de anexo.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` (file): PDF ou imagem, máx 10MB

**Response 201:**
```json
{
  "success": true,
  "data": {
    "attachmentId": "uuid",
    "fileName": "recibo.pdf",
    "fileType": "pdf",
    "url": "https://presigned-url...",
    "sizeBytes": 204800
  }
}
```

---

#### `POST /messages/conversations/:id/export`
Gerar PDF assinado da conversa.

**Request body:**
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-05-19"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "protocol": "GA-2026-A1B2C3",
    "downloadUrl": "https://presigned-url-24h...",
    "generatedAt": "2026-05-19T18:00:00Z",
    "messageCount": 45,
    "expiresAt": "2026-05-20T18:00:00Z"
  }
}
```

---

### MODULE: EXPENSES `/expenses`

---

#### `GET /expenses`
Listar despesas. Filtro por status.

**Query params:**
- `status` — pending | approved | contested | paid | all
- `childId` — opcional
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Consulta pediatra",
      "category": "saúde",
      "amount": 280.00,
      "myShare": 140.00,
      "coParentShare": 140.00,
      "splitRatio": "50/50",
      "status": "pending",
      "expenseDate": "2026-05-16",
      "submittedBy": {
        "id": "uuid",
        "name": "Ana Lima",
        "isMe": false
      },
      "receiptName": "recibo_consulta.pdf",
      "receiptUrl": "https://presigned-url...",
      "contestReason": null,
      "paidAt": null,
      "createdAt": "2026-05-16T10:05:00Z"
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 5 }
}
```

---

#### `GET /expenses/summary`
Resumo financeiro do período.

**Query params:**
- `month` (YYYY-MM)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalExpenses": 939.50,
    "myTotalShare": 469.75,
    "pendingApproval": 187.50,
    "pendingPayment": 92.25,
    "paid": 80.00,
    "byCategory": {
      "saúde": { "total": 280.00, "count": 1 },
      "educação": { "total": 279.50, "count": 2 },
      "lazer": { "total": 160.00, "count": 1 },
      "vestuário": { "total": 220.00, "count": 1 }
    }
  }
}
```

---

#### `POST /expenses`
Submeter despesa.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `childId` (string, obrigatório)
- `title` (string, obrigatório)
- `description` (string, opcional)
- `category` (enum, obrigatório)
- `amount` (number, obrigatório)
- `splitRatio` (enum, default "50/50")
- `expenseDate` (YYYY-MM-DD, obrigatório)
- `receipt` (file, opcional): PDF ou imagem, máx 10MB

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Consulta pediatra",
    "amount": 280.00,
    "status": "pending",
    "receiptUrl": "https://presigned-url..."
  }
}
```

**Ações internas:**
1. Upload do comprovante para MinIO (`receipts/uuid-filename`)
2. Calcular `checksum_sha256` do arquivo
3. Notificar co-parente: `expense_submitted`
4. Auditoria: `expense` — "Despesa submetida"

---

#### `GET /expenses/:id`
Detalhe de despesa.

**Response 200:** shape completo (igual ao GET /expenses mas objeto único + `contestedBy`, `approvedAt`, `paymentMethod`)

---

#### `PUT /expenses/:id/approve`
Aprovar despesa.

**Auth:** co-parente que NÃO submeteu

**Response 200:**
```json
{
  "success": true,
  "data": { "status": "approved", "approvedAt": "2026-05-19T18:00:00Z" }
}
```

---

#### `PUT /expenses/:id/contest`
Contestar despesa.

**Request body:**
```json
{ "reason": "A Helena já tem tênis novos. Não concordo com esta despesa." }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "contested",
    "contestReason": "A Helena já tem tênis novos...",
    "contestedAt": "2026-05-19T18:00:00Z"
  }
}
```

---

#### `POST /expenses/:id/pay`
Registrar pagamento de despesa aprovada.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `paymentMethod` (enum: pix | transferencia | dinheiro | outro, obrigatório)
- `paymentDate` (YYYY-MM-DD, obrigatório)
- `receipt` (file, opcional): comprovante de pagamento

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "paid",
    "paidAt": "2026-05-19T18:00:00Z",
    "paymentReceiptUrl": "https://presigned-url..."
  }
}
```

---

### MODULE: DOCUMENTS (COFRE) `/documents`

---

#### `GET /documents`
Listar documentos.

**Query params:**
- `category` — juridico | escola | saude | geral
- `search` — busca por nome
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Sentença de divórcio — 2024",
      "description": "Sentença homologatória do acordo de guarda compartilhada.",
      "category": "juridico",
      "fileType": "pdf",
      "sizeMb": 1.2,
      "uploadedBy": {
        "id": "uuid",
        "name": "Gabriel Santos",
        "isMe": true
      },
      "accessCount": 3,
      "uploadedAt": "2024-11-10T14:30:00Z"
    }
  ]
}
```

---

#### `POST /documents`
Fazer upload de documento.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` (file, obrigatório): PDF ou imagem, máx 50MB
- `name` (string, obrigatório)
- `description` (string, opcional)
- `category` (enum, obrigatório)

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Sentença de divórcio — 2024",
    "fileType": "pdf",
    "sizeMb": 1.2,
    "downloadUrl": "https://presigned-url..."
  }
}
```

---

#### `GET /documents/:id`
Detalhe do documento + log de acessos + URL para download.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Sentença de divórcio — 2024",
    "description": "...",
    "category": "juridico",
    "fileType": "pdf",
    "sizeMb": 1.2,
    "checksumSha256": "abc123...",
    "downloadUrl": "https://presigned-url-1h...",
    "uploadedBy": { "id": "uuid", "name": "Gabriel Santos", "isMe": true },
    "uploadedAt": "2024-11-10T14:30:00Z",
    "accessLog": [
      { "who": "Gabriel Santos", "action": "view", "at": "2024-11-10T14:30:00Z" },
      { "who": "Ana Lima",       "action": "view", "at": "2024-11-12T09:15:00Z" }
    ]
  }
}
```

**Ações internas:**
1. Registrar acesso em `document_access_log`
2. Gerar presigned URL com validade de 1h
3. Auditoria: `document` — "Documento visualizado"

---

#### `DELETE /documents/:id`
Excluir documento (soft delete).

**Auth:** apenas quem enviou pode excluir

**Response 200:**
```json
{ "success": true, "data": { "message": "Documento excluído." } }
```

---

### MODULE: HEALTH `/health`

---

#### `GET /health/entries`
Listar histórico de saúde.

**Query params:**
- `childId` (obrigatório)
- `type` — consulta | vacina | medicacao | exame | alergia
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "consulta",
      "title": "Consulta pediátrica semestral",
      "entryDate": "2026-04-15",
      "doctor": "Dra. Carla Mendes",
      "notes": "Desenvolvimento normal. Peso 26kg, altura 1.24m.",
      "createdBy": { "id": "uuid", "name": "Gabriel Santos", "isMe": true },
      "createdAt": "2026-04-15T14:00:00Z"
    }
  ]
}
```

---

#### `POST /health/entries`
Adicionar registro de saúde.

**Request body:**
```json
{
  "childId": "uuid",
  "type": "consulta",
  "title": "Consulta pediátrica semestral",
  "entryDate": "2026-04-15",
  "doctor": "Dra. Carla Mendes",
  "notes": "Desenvolvimento normal. Peso 26kg, altura 1.24m."
}
```

**Response 201:** retorna entry criado

---

#### `GET /health/vaccines/:childId`
Carteira de vacinação PNI.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "child": { "id": "uuid", "name": "Helena Santos" },
    "summary": { "ok": 6, "pending": 2, "overdue": 0, "total": 8 },
    "vaccines": [
      {
        "id": "uuid",
        "name": "Hepatite B",
        "pniCode": "HB",
        "totalDoses": 3,
        "dosesGiven": 3,
        "nextDueDate": null,
        "status": "ok",
        "doses": [
          { "doseNumber": 1, "appliedDate": "2018-03-20", "appliedBy": "Maternidade São Lucas" },
          { "doseNumber": 2, "appliedDate": "2018-05-15", "appliedBy": "UBS Vila Nova" },
          { "doseNumber": 3, "appliedDate": "2018-07-20", "appliedBy": "UBS Vila Nova" }
        ]
      },
      {
        "id": "uuid",
        "name": "Hepatite A",
        "pniCode": "HA",
        "totalDoses": 2,
        "dosesGiven": 1,
        "nextDueDate": "2026-06-15",
        "status": "pending",
        "doses": [
          { "doseNumber": 1, "appliedDate": "2025-06-10", "appliedBy": "UBS Vila Nova" }
        ]
      }
    ]
  }
}
```

---

#### `POST /health/vaccines/:vaccineId/doses`
Registrar aplicação de dose.

**Request body:**
```json
{
  "doseNumber": 2,
  "appliedDate": "2026-06-15",
  "appliedBy": "UBS Vila Nova",
  "batchNumber": "LOTE-2026-001"
}
```

**Response 201:** retorna vacina atualizada com novo status

---

### MODULE: MILESTONES `/milestones`

---

#### `GET /milestones`
Listar marcos do diário.

**Query params:**
- `childId` (obrigatório)
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Primeiro dia de natação",
      "description": "Helena entrou na água com tudo!",
      "milestoneDate": "2026-03-05",
      "emoji": "🏊",
      "photoUrl": "https://presigned-url...",
      "createdBy": { "id": "uuid", "name": "Gabriel Santos", "isMe": true },
      "comments": [
        {
          "id": "uuid",
          "author": { "id": "uuid", "name": "Ana Lima" },
          "text": "Que orgulho! Ela contou tudo pra mim também ❤️",
          "createdAt": "2026-03-05T20:00:00Z"
        }
      ],
      "createdAt": "2026-03-05T18:00:00Z"
    }
  ]
}
```

---

#### `POST /milestones`
Criar marco.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `childId` (string, obrigatório)
- `title` (string, obrigatório)
- `description` (string, opcional)
- `milestoneDate` (YYYY-MM-DD, obrigatório)
- `emoji` (string, default "🌟")
- `photo` (file, opcional): imagem, máx 20MB

**Response 201:** retorna marco criado

---

#### `POST /milestones/:id/comments`
Comentar em um marco.

**Request body:**
```json
{ "text": "Que conquista linda!" }
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "author": { "id": "uuid", "name": "Ana Lima" },
    "text": "Que conquista linda!",
    "createdAt": "2026-03-05T20:00:00Z"
  }
}
```

---

### MODULE: AUDIT `/audit`

---

#### `GET /audit`
Listar trilha de auditoria.

**Query params:**
- `type` — message | expense | event | document | decision | login | health | vaccine | milestone | settings | lgpd
- `startDate` / `endDate` (YYYY-MM-DD)
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "eventType": "message",
      "description": "Mensagem enviada para Ana Lima",
      "actor": { "id": "uuid", "name": "Gabriel Santos" },
      "hash": "a3f2c1d9...",
      "previousHash": "b4f3c2d1...",
      "createdAt": "2026-05-19T17:32:00Z"
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 347 }
}
```

---

#### `POST /audit/export`
Gerar PDF assinado da trilha de auditoria.

**Request body:**
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-05-19",
  "types": ["message", "expense", "event", "document"]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "protocol": "AU-2026-A1B2C3",
    "downloadUrl": "https://presigned-url-24h...",
    "eventCount": 127,
    "generatedAt": "2026-05-19T18:00:00Z",
    "expiresAt": "2026-05-20T18:00:00Z"
  }
}
```

---

### MODULE: NOTIFICATIONS `/notifications`

---

#### `GET /notifications`
Listar notificações do usuário.

**Query params:**
- `unreadOnly` (boolean, default false)
- `page`, `perPage`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "expense_submitted",
      "title": "Nova despesa para aprovar",
      "body": "Ana Lima submeteu uma despesa de R$ 280,00 (Consulta pediatra).",
      "entityType": "expenses",
      "entityId": "uuid",
      "readAt": null,
      "createdAt": "2026-05-16T10:05:00Z"
    }
  ],
  "meta": { "unreadCount": 3 }
}
```

---

#### `PUT /notifications/:id/read`
Marcar notificação como lida.

**Response 200:**
```json
{ "success": true, "data": { "readAt": "2026-05-19T18:00:00Z" } }
```

---

#### `PUT /notifications/read-all`
Marcar todas como lidas.

**Response 200:**
```json
{ "success": true, "data": { "updated": 3 } }
```

---

### MODULE: LGPD `/lgpd`

---

#### `GET /lgpd/consents`
Listar status de todos os consentimentos.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "consentType": "terms_of_use",
      "version": "1.2",
      "granted": true,
      "required": true,
      "grantedAt": "2024-11-10T14:30:00Z",
      "revokedAt": null
    },
    {
      "consentType": "marketing_email",
      "version": "1.0",
      "granted": false,
      "required": false,
      "grantedAt": null,
      "revokedAt": "2025-03-01T10:00:00Z"
    }
  ]
}
```

---

#### `PUT /lgpd/consents/:type`
Conceder ou revogar consentimento opcional.

**Request body:**
```json
{ "granted": false }
```

**Validação:** `terms_of_use` e `privacy_policy` não podem ser revogados (retornar `403 FORBIDDEN`)

**Response 200:**
```json
{ "success": true, "data": { "consentType": "marketing_email", "granted": false, "revokedAt": "2026-05-19T18:00:00Z" } }
```

---

#### `POST /lgpd/data-export`
Solicitar exportação de todos os dados (Art. 18 LGPD).

**Response 202:**
```json
{
  "success": true,
  "data": {
    "message": "Exportação solicitada. Você receberá um e-mail com o arquivo em até 15 dias úteis.",
    "protocol": "LGPD-2026-EXP-001"
  }
}
```

---

#### `DELETE /lgpd/account`
Solicitar exclusão de conta e dados (Art. 18 LGPD).

**Request body:**
```json
{
  "password": "SenhaAtual@123",
  "reason": "Não utilizo mais o serviço"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": "Sua conta será excluída em até 15 dias úteis. Você receberá confirmação por e-mail.",
    "protocol": "LGPD-2026-DEL-001",
    "scheduledAt": "2026-06-03T00:00:00Z"
  }
}
```

**Ação interna:** marcar `deleted_at` na tabela `users`. Dados são anonimizados, não destruídos, para preservar trilha de auditoria com valor legal.

---

## 8. SERVIÇOS INTERNOS

### 8.1 Hash Chain de Auditoria (`services/hashChain.js`)

```js
// Cada evento de auditoria tem:
// hash = SHA256(JSON.stringify({ eventType, description, actorId, entityId, timestamp }) + previousHash)
// Isso cria uma cadeia imutável onde qualquer alteração retroativa
// invalida todos os hashes subsequentes.

function computeHash(eventData, previousHash) {
  const payload = JSON.stringify(eventData) + (previousHash || '');
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

### 8.2 Filtro de Linguagem Hostil (`services/hostilityFilter.js`)

```js
// Lista de padrões regex + score de hostilidade
// Retorna { hostile: boolean, score: number, suggestion: string }
// Não bloqueia — apenas avisa. O usuário pode forçar o envio.
const HOSTILE_PATTERNS = [
  { pattern: /irresponsável/i, score: 0.7 },
  { pattern: /incompetente/i, score: 0.8 },
  { pattern: /mentiroso?/i,   score: 0.9 },
  // ... etc
];
```

### 8.3 Geração de PDF Assinado (`services/pdfExport.js`)

```js
// Usar pdfkit para gerar o documento
// Campos obrigatórios no PDF:
// - Logo GuardaApp
// - Número de protocolo (GA-YYYY-XXXXXX)
// - Hash SHA-256 da cadeia
// - QR Code para verificação de autenticidade online
// - Timestamp de geração com timezone America/Sao_Paulo
// - Nome completo das partes
// - Watermark "DOCUMENTO COM VALOR PROBATÓRIO"
```

---

## 9. MIDDLEWARE DE AUDITORIA

Todo controller que faz escrita (POST/PUT/DELETE) deve chamar o `auditLogger`:

```js
// Exemplo de uso
await auditLogger.log({
  req,                          // Para extrair userId e IP
  connectionId,
  eventType: 'expense',
  description: `Despesa "${title}" submetida — R$ ${amount}`,
  entityType: 'expenses',
  entityId: expense.id,
  metadata: { amount, category, splitRatio }
});
```

O middleware internamente:
1. Busca o hash do último evento da conexão
2. Calcula o novo hash encadeado
3. Insere o registro em `audit_events`

---

## 10. CONFIGURAÇÃO SWAGGER

Todas as rotas devem ter documentação completa com `@swagger` JSDoc:
- Tags por módulo (Auth, Users, Events, etc.)
- `requestBody` com schema completo
- `responses` com exemplos para 200, 201, 400, 401, 403, 404, 422
- Campos `required` e `nullable` corretos
- Enum values listados
- `securitySchemes: bearerAuth` para rotas autenticadas

Swagger UI disponível em: `GET /docs`

---

## 11. INICIALIZAÇÃO DO BANCO (Ordem de execução)

```
001 → users
002 → user_sessions
003 → coparent_connections
004 → children
005 → events
006 → conversations
007 → messages + message_attachments
008 → expenses
009 → documents + document_access_log
010 → health_entries
011 → vaccines + vaccine_doses
012 → milestones + milestone_comments
013 → audit_events
014 → notifications
015 → user_consents
```

---

## 12. DEPENDÊNCIAS PACKAGE.JSON (principais)

```json
{
  "dependencies": {
    "express": "^4.19.0",
    "mysql2": "^3.9.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "minio": "^7.1.3",
    "multer": "^1.4.5-lts.1",
    "swagger-ui-express": "^5.0.0",
    "swagger-jsdoc": "^6.2.8",
    "pdfkit": "^0.15.0",
    "qrcode": "^1.5.3",
    "express-rate-limit": "^7.3.1",
    "express-validator": "^7.1.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.4.5",
    "uuid": "^9.0.1",
    "date-fns-tz": "^3.1.3",
    "nodemailer": "^6.9.13"
  }
}
```

---

*Fim da especificação — GuardaApp Backend v1.0*
