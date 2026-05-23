# GuardaApp — Spec de Backend: Painel Administrativo (API Admin)

> **Objetivo:** expor uma **API administrativa** consumida por um app web React separado (`admin.guardaapp`), acessível **somente** por operadores internos (perfil admin), para gerenciar e operar todo o sistema: usuários, conexões de co-parentalidade, planos/assinaturas, suporte, moderação de conteúdo sinalizado, solicitações LGPD, supervisão de auditoria e métricas. O acesso de usuários finais (genitores) **não muda**.
>
> **Stack atual (preservar):** Node.js 20 LTS · Express 4 · MySQL 8 · MinIO · JWT · Swagger · envelope `{ success, data, meta }`.
> **Princípio inviolável de privacidade:** administradores **não** têm acesso a conteúdo sensível em texto claro (corpo de mensagens, arquivos do cofre, comprovantes, históricos de saúde). O painel opera sobre **metadados** e ações de governança. Toda ação administrativa é **auditada** numa trilha própria, append-only.

---

## 0. CONTEXTO — O QUE JÁ EXISTE (não reescrever)

- `migrations/001_create_users.sql` — `users.role` é o **papel familiar** (`pai`,`mãe`,...). **Não** representa perfil de plataforma. Não existe role admin hoje.
- `migrations/003_create_coparent_connections.sql` — conexões entre genitores.
- `migrations/012_create_audit.sql` — auditoria **por conexão** (família). A auditoria administrativa é **separada** desta.
- `migrations/014_create_consents.sql` + `src/services/lgpdService.js` — consentimentos e data-subject requests.
- `src/config/jwt.js` — `verifyAccess`; `src/middleware/auth.js` — auth de usuário final.
- `src/services/storage.js`, `src/config/minio.js`.

**Decisão de arquitetura:** o admin é um **realm de autenticação separado**, com tabela `admin_users` própria, JWT com claim `scope: 'admin'`, e middleware `adminAuth` independente do `auth` de usuário final. Isso impede escalonamento de privilégio a partir de uma conta de genitor e isola superfície de ataque.

---

## 1. MODELO DE PERMISSÕES (RBAC)

Papéis administrativos (`admin_users.admin_role`):
- `superadmin` — acesso total, inclusive gestão de outros admins e configurações da plataforma.
- `suporte` — gestão de usuários/conexões, tickets, reset de acesso; **sem** dados financeiros nem exclusões definitivas.
- `financeiro` — planos, assinaturas, relatórios financeiros agregados; **sem** moderação de conteúdo.
- `auditor` — somente leitura: auditoria, logs, métricas, exportações de compliance. Não executa ações mutáveis.
- `compliance_dpo` — DPO/LGPD: processa data-subject requests, gerencia retenção e consentimentos.

Permissões granulares por recurso (matriz aplicada no middleware `requirePermission(resource, action)`):

| Recurso | superadmin | suporte | financeiro | auditor | compliance_dpo |
|---|---|---|---|---|---|
| users.read / write | ✓ / ✓ | ✓ / ✓ | ✓ / – | ✓ / – | ✓ / – |
| users.suspend | ✓ | ✓ | – | – | – |
| users.delete (hard) | ✓ | – | – | – | – |
| connections.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| billing.* | ✓ | – | ✓ | ✓(read) | – |
| moderation.* | ✓ | ✓ | – | ✓(read) | – |
| audit.read / export | ✓ | – | – | ✓ | ✓ |
| lgpd.requests.* | ✓ | – | – | – | ✓ |
| admins.manage | ✓ | – | – | – | – |
| settings.platform | ✓ | – | – | – | – |

> Implementar como mapa estático `ADMIN_PERMISSIONS[role] = Set<'resource.action'>` em `src/config/adminPermissions.js`. `superadmin` é curinga.

---

## 2. MIGRATION

Criar `migrations/024_create_admin.sql`:

```sql
-- Operadores internos (realm separado dos usuários finais)
CREATE TABLE IF NOT EXISTS admin_users (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  admin_role      ENUM('superadmin','suporte','financeiro','auditor','compliance_dpo') NOT NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  mfa_secret      VARCHAR(64)  NULL COMMENT 'TOTP — MFA obrigatório p/ admin',
  mfa_enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_at   DATETIME     NULL,
  created_by_id   VARCHAR(36)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  INDEX idx_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sessões admin (separadas de user_sessions)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id             VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  admin_id       VARCHAR(36)  NOT NULL,
  refresh_token  VARCHAR(255) NOT NULL,
  ip             VARCHAR(45)  NULL,
  user_agent     VARCHAR(255) NULL,
  expires_at     DATETIME     NOT NULL,
  revoked_at     DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Trilha de auditoria ADMINISTRATIVA (append-only, hash encadeado global)
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  admin_id      VARCHAR(36)   NOT NULL,
  action        VARCHAR(80)   NOT NULL COMMENT 'ex.: user.suspend, billing.refund',
  target_type   VARCHAR(40)   NULL    COMMENT 'user, connection, ticket...',
  target_id     VARCHAR(36)   NULL,
  description   TEXT          NOT NULL,
  metadata      JSON          NULL,
  ip            VARCHAR(45)   NULL,
  previous_hash CHAR(64)      NULL,
  hash          CHAR(64)      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_admin_action (admin_id, action),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tickets de suporte
CREATE TABLE IF NOT EXISTS support_tickets (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  user_id       VARCHAR(36)   NULL,
  subject       VARCHAR(200)  NOT NULL,
  body          TEXT          NOT NULL,
  category      ENUM('conta','pagamento','bug','denuncia','lgpd','outro') NOT NULL DEFAULT 'outro',
  status        ENUM('aberto','em_andamento','aguardando_usuario','resolvido','fechado') NOT NULL DEFAULT 'aberto',
  priority      ENUM('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
  assigned_to_id VARCHAR(36)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id)        REFERENCES users(id),
  FOREIGN KEY (assigned_to_id) REFERENCES admin_users(id),
  INDEX idx_status (status, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conteúdo sinalizado (gerado pelo filtro de hostilidade ou denúncia do usuário)
CREATE TABLE IF NOT EXISTS moderation_flags (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id VARCHAR(36)   NOT NULL,
  content_type  ENUM('message','expense','document','milestone') NOT NULL,
  content_id    VARCHAR(36)   NOT NULL,
  reason        ENUM('linguagem_hostil','denuncia_usuario','suspeita_fraude','outro') NOT NULL,
  severity      ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  status        ENUM('pendente','em_analise','procedente','improcedente') NOT NULL DEFAULT 'pendente',
  reviewed_by_id VARCHAR(36)  NULL,
  reviewed_at   DATETIME      NULL,
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id)   REFERENCES coparent_connections(id),
  FOREIGN KEY (reviewed_by_id)  REFERENCES admin_users(id),
  INDEX idx_status (status, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Seed inicial: um `superadmin` em `migrations/025_seed_superadmin.sql` (email/hash bcrypt cost 12), com `mfa_enabled=0` e instrução para habilitar MFA no primeiro login.

---

## 3. AUTENTICAÇÃO ADMIN

- `src/config/jwt.js` ganha `signAdminAccess(payload)` / `verifyAdminAccess(token)` com **segredo distinto** (`ADMIN_JWT_SECRET`) e claim `scope: 'admin'` + `adminRole`. Access curto (15 min), refresh em `admin_sessions`.
- **MFA (TOTP) obrigatório** para todos os admins. Login = senha + código TOTP. Sem MFA habilitado, libera apenas o fluxo de setup de MFA.
- `src/middleware/adminAuth.js`: valida o token admin, rejeita tokens de usuário final (checa `scope === 'admin'`), popula `req.adminId`, `req.adminRole`.
- `src/middleware/requirePermission.js`: `requirePermission('users','suspend')` → consulta `ADMIN_PERMISSIONS`.
- **Rate limiting reforçado** no login admin (reusar `rateLimiter` com limite menor) e bloqueio temporário após N falhas.
- **CORS isolado**: a API admin só aceita origem `ADMIN_WEB_ORIGIN`.

---

## 4. SERVICES E CONTROLLERS

Criar sob `src/admin/` (subdiretório para isolar do app do usuário final):

```
src/admin/services/adminAuthService.js     // login, MFA, refresh, gestão de admins
src/admin/services/adminUserService.js     // CRUD/consulta de usuários finais (metadados)
src/admin/services/adminConnectionService.js
src/admin/services/billingService.js        // planos, assinaturas, métricas financeiras
src/admin/services/ticketService.js
src/admin/services/moderationService.js
src/admin/services/adminAuditService.js      // log append-only (hash encadeado global)
src/admin/services/metricsService.js         // KPIs e séries temporais
src/admin/controllers/*.js                    // 1 por service, envelope padrão
```

`adminAuditService.log(adminId, action, { targetType, targetId, description, metadata, ip })` calcula `hash` encadeado (último hash global) e grava em `admin_audit_events`. **Toda** mutação administrativa chama esse log.

**Guardrail de privacidade (implementar e testar):**
- `adminUserService` e afins retornam **somente metadados**: nome, email, status, datas, contadores (nº de filhos, nº de mensagens, nº de despesas), plano. **Nunca** corpo de mensagem, conteúdo de documento, comprovante, dado de saúde.
- moderação de mensagem hostil expõe **somente** o trecho já marcado pelo `hostilityFilter` e estritamente o necessário para a decisão, com registro de quem visualizou (`admin_audit_events`).
- nenhum endpoint admin gera URL presignada de cofre/comprovante de família.

---

## 5. ROTAS (`/api/v1/admin`, protegidas por `adminAuth` + `requirePermission`)

Montar em `app.js`: `app.use('/api/v1/admin', require('./admin/routes'))` (router agregador).

**Auth**
```
POST /admin/auth/login              { email, password, totp } → tokens
POST /admin/auth/refresh
POST /admin/auth/logout
POST /admin/auth/mfa/setup          → QR/secret
POST /admin/auth/mfa/verify
```

**Dashboard / métricas** (`metrics.read`)
```
GET  /admin/metrics/overview        → usuários ativos, novas conexões, MRR, tickets abertos, flags pendentes
GET  /admin/metrics/timeseries?metric=signups&range=30d
```

**Usuários** (`users.*`)
```
GET    /admin/users?search=&status=&plan=&page=
GET    /admin/users/:id             → metadados + conexões + plano + atividade (sem conteúdo)
PATCH  /admin/users/:id             → editar dados básicos / corrigir email
POST   /admin/users/:id/suspend     { reason }
POST   /admin/users/:id/reactivate
POST   /admin/users/:id/reset-access → dispara fluxo de reset (não define senha manualmente)
DELETE /admin/users/:id             → hard delete (somente superadmin, com confirmação + motivo)
```

**Conexões** (`connections.read`)
```
GET /admin/connections?status=&page=
GET /admin/connections/:id          → genitores, filhos, status, modo baixo conflito, contadores
```

**Billing** (`billing.*`)
```
GET  /admin/billing/plans
POST /admin/billing/plans           (superadmin/financeiro)
GET  /admin/billing/subscriptions?status=
POST /admin/billing/subscriptions/:id/refund   { amount, reason }
GET  /admin/billing/reports?range=
```

**Tickets de suporte** (`moderation`/`suporte`)
```
GET   /admin/tickets?status=&priority=&assignee=
GET   /admin/tickets/:id
POST  /admin/tickets/:id/assign     { adminId }
POST  /admin/tickets/:id/reply      { body }   (registra; não expõe dados sensíveis)
PATCH /admin/tickets/:id            { status, priority }
```

**Moderação** (`moderation.*`)
```
GET   /admin/moderation/flags?status=&severity=
GET   /admin/moderation/flags/:id   → trecho sinalizado + contexto mínimo
POST  /admin/moderation/flags/:id/resolve { decision: procedente|improcedente, notes }
```

**LGPD / DPO** (`lgpd.requests.*` — perfil `compliance_dpo`/`superadmin`)
```
GET  /admin/lgpd/requests?status=
POST /admin/lgpd/requests/:id/process   → dispara export/eliminação via lgpdService (respeita retenção legal)
GET  /admin/lgpd/retention             → políticas de retenção vigentes
```

**Auditoria** (`audit.read` / `audit.export`)
```
GET /admin/audit?adminId=&action=&from=&to=&page=   → trilha administrativa
GET /admin/audit/verify                              → verifica integridade da cadeia de hash
GET /admin/audit/export.pdf                          → relatório de compliance assinado
```

**Gestão de admins** (`admins.manage` — somente superadmin)
```
GET    /admin/admins
POST   /admin/admins                { name, email, adminRole }
PATCH  /admin/admins/:id            { adminRole, isActive }
DELETE /admin/admins/:id
```

Documentar tudo no Swagger sob um **grupo separado** (`tags: [Admin]`) e idealmente um `swagger` admin com basic-auth próprio.

---

## 6. SEGURANÇA E COMPLIANCE

- **Segredo JWT distinto** e tokens com `scope: 'admin'`; rejeitar cross-realm.
- **MFA obrigatório**, rate limit agressivo no login, lockout temporário.
- **CORS** restrito a `ADMIN_WEB_ORIGIN`; **IP allowlist** opcional via env (`ADMIN_IP_ALLOWLIST`).
- **Auditoria append-only** com hash encadeado para *toda* ação; endpoint de verificação de integridade.
- **Princípio do menor privilégio**: matriz RBAC aplicada em middleware, não na UI.
- **Sem acesso a conteúdo sensível**: testes automatizados garantindo que nenhuma rota admin retorna corpo de mensagem, conteúdo de cofre, comprovante ou dado de saúde.
- **Acesso a dados pessoais é logado** (quem viu o quê) para responder a auditorias LGPD.

---

## 7. CHECKLIST DE ENTREGA

- [ ] `migrations/024_create_admin.sql` + `025_seed_superadmin.sql`.
- [ ] `config/jwt.js`: funções admin; `config/adminPermissions.js`.
- [ ] `middleware/adminAuth.js` + `middleware/requirePermission.js`.
- [ ] `src/admin/` (services + controllers + routes agregador) montado em `app.js`.
- [ ] MFA TOTP no login admin.
- [ ] `adminAuditService` com hash encadeado e endpoint de verificação.
- [ ] Guardrails de privacidade + testes que comprovam ausência de vazamento de conteúdo.
- [ ] Swagger do grupo Admin; CORS/rate limit/IP allowlist por env.
