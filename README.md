# GuardaApp — Backend API

API REST da plataforma de co-parentalidade GuardaApp. Permite que pais separados gerenciem de forma segura a agenda dos filhos, finanças compartilhadas, comunicação, documentos e histórico de saúde — tudo com trilha de auditoria com valor probatório legal.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express 4 |
| Banco de dados | MySQL 8.0 |
| Armazenamento de arquivos | MinIO (S3-compatible) |
| Autenticação | JWT (access 15 min + refresh 30 dias) |
| Hash de senhas | bcrypt (custo 12) |
| Documentação | Swagger UI / OpenAPI 3.0 |
| Containerização | Docker + Docker Compose |

---

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose instalados
- Portas `3000`, `3306`, `9000` e `9001` livres

---

## Subir o ambiente

```bash
# Clonar e entrar na pasta
cd backend

# Copiar o arquivo de variáveis de ambiente
cp .env.example .env

# Subir todos os serviços (API + MySQL + MinIO)
docker compose up -d --build
```

O MySQL executa automaticamente todas as migrations em `migrations/` na primeira inicialização, incluindo o seed de dados de demonstração.

### Verificar saúde da API

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## Serviços disponíveis

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| API REST | http://localhost:3000 | — |
| Swagger UI | http://localhost:3000/docs | — |
| MinIO Console | http://localhost:9001 | `minioadmin` / `minioadmin` |
| MySQL | localhost:3306 | `guardaapp` / `root_senha` |

---

## Autenticação na API

A API usa **JWT Bearer Token**. Para autenticar no Swagger UI:

1. Acesse http://localhost:3000/docs
2. Faça `POST /api/v1/auth/login` com as credenciais abaixo
3. Copie o `accessToken` retornado
4. Clique em **Authorize** (cadeado) e cole o token

```
Bearer eyJhbGciOi...
```

---

## Credenciais de demonstração

Dois usuários pré-cadastrados com conexão de co-parentalidade ativa:

| Usuário | E-mail | Senha | Papel |
|---------|--------|-------|-------|
| Carlos Eduardo Silva | `admin@admin.com` | `123456` | Pai |
| Maria Fernanda Costa | `maria@guardaapp.com` | `123456` | Mãe |

---

## Dados de demonstração (seed)

A migration `015_seed_admin.sql` popula o banco com dados realistas:

### Filhos
| Nome | Nascimento | Escola | Tipo sanguíneo |
|------|-----------|--------|----------------|
| Sophia Silva Costa | 15/03/2017 | Escola Municipal João XXIII | A+ |
| Lucas Silva Costa | 22/08/2020 | CEI Criança Feliz | O+ |

### Despesas (5 registros)
| Descrição | Valor | Status |
|-----------|-------|--------|
| Consulta pediatra — Dr. Ricardo | R$ 350,00 | `approved` |
| Material escolar 1º semestre | R$ 480,00 | `pending` |
| Tênis Nike — Lucas | R$ 120,00 | `paid` (PIX) |
| Psicólogo infantil — Sophia | R$ 850,00 | `contested` |
| Óculos de grau — Sophia | R$ 620,00 | `pending` |

### Eventos (6 registros)
- Consulta pediátrica da Sophia — em 3 dias (`confirmed`)
- Troca de guarda — em 5 dias (`confirmed`)
- Reunião de pais CEI — em 7 dias (`pending`)
- Apresentação de dança da Sophia — em 14 dias (`confirmed`)
- Aniversário de 6 anos do Lucas — 22/08/2026 (`pending`)
- Troca de guarda passada — há 7 dias (`confirmed`)

### Mensagens (8 registros)
Conversa encadeada com hashes SHA-256 entre Carlos e Maria sobre logística da semana.

### Saúde (5 registros)
Consultas, exame de hemograma, episódio alérgico (amendoim), otorrinolaringologia e colírio oftalmológico.

### Vacinas
| Criança | Vacinas | Doses |
|---------|---------|-------|
| Sophia | 4 (Hep B, Tríplice Viral, HPV, dTpa) | 6 doses |
| Lucas | 4 (Hep B, Pentavalente, Varicela, Meningocócica C) | 9 doses |

> dTpa da Sophia está **atrasada** e Varicela do Lucas com **dose pendente** — útil para testar alertas.

### Marcos de desenvolvimento (8 registros)
Primeiras palavras, primeiros passos, aprendeu a andar de bicicleta, primeiro dia no CEI sem chorar, entre outros.

### Trilha de auditoria (7 eventos)
Cadeia de hashes SHA-256 cobrindo cadastros, conexão e movimentações financeiras.

### Notificações (9 registros)
Misto de lidas e não lidas para ambos os usuários.

---

## Rotas da API

Base path: `/api/v1`

| Prefixo | Tag Swagger | Descrição |
|---------|-------------|-----------|
| `/auth` | Auth | Registro, login, refresh, reset de senha |
| `/users` | Users | Perfil, avatar, modo baixo conflito |
| `/sessions` | Sessões | Dispositivos conectados |
| `/coparent` | Co-parentalidade | Convite, conexão, medida protetiva |
| `/children` | Filhos | CRUD de filhos |
| `/events` | Eventos | Agenda compartilhada |
| `/messages` | Mensagens | Canal com filtro de hostilidade |
| `/expenses` | Despesas | Gestão financeira compartilhada |
| `/documents` | Documentos | Repositório de documentos (MinIO) |
| `/health` | Saúde | Registros médicos |
| `/vaccines` | Vacinas | Carteira de vacinação |
| `/milestones` | Marcos | Memórias de desenvolvimento |
| `/audit` | Auditoria | Trilha com cadeia de hashes |
| `/notifications` | Notificações | Central + preferências |
| `/lgpd` | LGPD | Consentimentos e portabilidade de dados |

Total: **72 endpoints** documentados no Swagger.

---

## Estrutura de pastas

```
backend/
├── migrations/          # 15 arquivos SQL (001–015), executados em ordem
│   └── 015_seed_admin.sql
├── src/
│   ├── config/          # database, jwt, minio, swagger
│   ├── controllers/     # lógica de requisição/resposta (15 arquivos)
│   ├── middleware/       # auth, coparent, rateLimiter, auditLogger, errorHandler
│   ├── routes/          # Express Router + JSDoc Swagger (15 arquivos)
│   ├── services/        # regras de negócio (authService, hashChain, hostilityFilter, pdfExport, storage, notificationService)
│   └── utils/           # cpfValidator, paginate, formatBRL
├── .env                 # variáveis de ambiente (não versionado)
├── .env.example         # template de variáveis
├── Dockerfile
├── docker-compose.yml
├── package.json
└── server.js
```

---

## Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta da API | `3000` |
| `NODE_ENV` | Ambiente | `development` |
| `DB_HOST` | Host do MySQL | `localhost` |
| `DB_NAME` | Nome do banco | `guardaapp` |
| `DB_USER` | Usuário MySQL | `guardaapp` |
| `DB_PASSWORD` | Senha MySQL | — |
| `JWT_SECRET` | Chave do access token | — |
| `JWT_EXPIRES_IN` | Expiração do access token | `15m` |
| `JWT_REFRESH_SECRET` | Chave do refresh token | — |
| `JWT_REFRESH_EXPIRES_IN` | Expiração do refresh token | `30d` |
| `MINIO_ENDPOINT` | Host do MinIO | `localhost` |
| `MINIO_ACCESS_KEY` | Usuário MinIO | `minioadmin` |
| `MINIO_SECRET_KEY` | Senha MinIO | `minioadmin` |
| `AUDIT_CHAIN_SECRET` | Segredo HMAC da trilha | — |
| `SMTP_HOST` | Servidor de e-mail | `smtp.mailtrap.io` |
| `RATE_LIMIT_MAX` | Req. por janela de 15 min | `100` |

---

## Funcionalidades de segurança

- **Filtro de hostilidade**: mensagens são analisadas por regex em português antes do envio. Mensagens acima do limiar retornam `422` com sugestão de reformulação.
- **Trilha de auditoria encadeada**: todo evento de escrita gera um hash SHA-256 que encadeia com o hash anterior (modelo blockchain-simples), garantindo integridade detectável.
- **LGPD**: anonimização de dados em exclusão de conta, exportação de dados pessoais (Art. 18), gestão de consentimentos com versão e timestamp.
- **Rate limiting**: 100 requisições por 15 minutos por IP (configurável).
- **Helmet + CORS**: cabeçalhos de segurança HTTP aplicados globalmente.
- **Tokens de curta duração**: access token de 15 minutos, renovável via refresh token de 30 dias armazenado em banco com suporte a revogação individual ou total.

---

## Reiniciar do zero

Para recriar o banco e re-executar todas as migrations + seed:

```bash
docker compose down -v   # remove containers e volumes
docker compose up -d     # recria tudo do zero
```

> O seed `015_seed_admin.sql` é executado automaticamente pelo MySQL na inicialização.
