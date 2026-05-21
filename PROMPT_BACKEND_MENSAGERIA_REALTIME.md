# GuardaApp — Prompt de Atualização do Backend: Mensageria em Tempo Real

> **Objetivo:** evoluir a mensageria existente para funcionar como o WhatsApp (apenas texto), com servidor WebSocket (Socket.IO), notificação ao destinatário em tempo real + push em background, e confirmação de leitura com 3 estados de tick (enviado → entregue → lido).
>
> **Stack atual:** Node.js 20 LTS · Express 4 · MySQL 8 · MinIO · JWT (access + refresh) · Swagger.
> **Decisões já tomadas:** Socket.IO · Push via Expo (expo-server-sdk) · 3 estados de tick (adicionar `delivered_at`) · **sem** presença "online"/"digitando".
> **Princípio inviolável:** mensagens são **imutáveis e auditáveis** (hash SHA-256 encadeado, trilha append-only, filtro de hostilidade). Realtime e ticks são metadados de entrega — **nunca** alteram o conteúdo nem o `hash` da mensagem.

---

## 0. CONTEXTO — O QUE JÁ EXISTE (não reescrever)

Já implementado e funcionando, **deve ser preservado**:

- `migrations/006_create_conversations_messages.sql` — tabelas `conversations`, `messages` (com `hash`, `previous_hash`, `is_hostile`, `read_at`, `deleted_at`), `message_attachments`.
- `migrations/013_create_notifications.sql` — `notifications` (enum já inclui `new_message`) e `notification_preferences` (`email_enabled`, `push_enabled`).
- `src/services/messageService.js` — `listByConnection`, `findById`, `ensureConversation`, `create`, `markForcedSend`, `listAll`, `markRead`.
- `src/controllers/messageController.js` — `listMessages`, `sendMessage` (com filtro de hostilidade + `notifyNewMessage`), `getMessage`, `forceSend`, `exportPdf`, `uploadAttachment`, `exportConversation`.
- `src/routes/messages.js` — rotas REST sob `/api/v1/messages`, protegidas por `auth` + `coparent`.
- `src/services/hostilityFilter.js`, `src/services/hashChain.js`, `src/services/notificationService.js`.
- `src/middleware/auth.js` (valida JWT, popula `req.userId`, `req.sessionId`), `src/middleware/coparent.js` (popula `req.connectionId`, `req.connection`).
- `src/config/jwt.js` exporta `verifyAccess(token)`.
- `server.js` faz `app.listen(PORT)` direto (sem servidor HTTP explícito).

**Esta atualização adiciona uma camada realtime sobre essa base, sem quebrar nenhum endpoint REST atual.**

---

## 1. ESCOPO DA ENTREGA

1. Migration para suportar 3 estados de tick e push tokens.
2. Servidor Socket.IO acoplado ao mesmo processo HTTP do Express, com autenticação JWT no handshake e isolamento por conversa (room = `connectionId`).
3. Eventos WebSocket: envio em tempo real, ACK de entrega (`delivered`), confirmação de leitura (`read`).
4. Notificação ao destinatário: in-app via WS (app aberto) **e** push Expo (app em background/fechado).
5. Endpoints REST novos/ajustados: marcar entregue, marcar lido, registrar push token.
6. Integração com o fluxo existente de hostilidade e hash chain (sem alterá-lo).
7. Documentação Swagger dos novos endpoints + documento de eventos WS.

> **Apenas texto.** Não implementar áudio, imagem ou vídeo no chat nesta fase. Anexos de conversa (`uploadAttachment`) continuam existindo para fins jurídicos, mas o chat em si é texto puro.

---

## 2. MIGRATION

Criar `migrations/021_message_realtime.sql`:

```sql
-- 3 estados de tick: enviado (created_at) → entregue (delivered_at) → lido (read_at)
ALTER TABLE messages
  ADD COLUMN delivered_at DATETIME NULL AFTER hash;

-- índice para varrer mensagens ainda não entregues/lidas de forma eficiente
ALTER TABLE messages
  ADD INDEX idx_delivery_status (conversation_id, sender_id, delivered_at, read_at);

-- Push tokens (Expo) por dispositivo/sessão do usuário
CREATE TABLE IF NOT EXISTS push_tokens (
  id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  user_id      VARCHAR(36)  NOT NULL,
  expo_token   VARCHAR(255) NOT NULL,
  platform     ENUM('ios','android') NOT NULL,
  last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_token (user_id, expo_token),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_push (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Regra de estado dos ticks (derivada, não persistir status redundante):**
- `created_at` preenchido, `delivered_at` NULL → **enviado** (✓ um tick cinza).
- `delivered_at` preenchido, `read_at` NULL → **entregue** (✓✓ dois ticks cinza).
- `read_at` preenchido → **lido** (✓✓ dois ticks azuis).

---

## 3. DEPENDÊNCIAS

Adicionar ao `package.json`:

```json
"socket.io": "^4.7.5",
"expo-server-sdk": "^3.10.0"
```

Nenhuma outra dependência nova. Manter `jsonwebtoken`, `uuid`, etc.

---

## 4. REFATORAÇÃO DO `server.js` (HTTP explícito + Socket.IO)

O Express precisa compartilhar o mesmo servidor HTTP que o Socket.IO. Refatorar `server.js`:

```js
require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { initSocket } = require('./src/realtime/socket');
const { client, BUCKETS } = require('./src/config/minio');

const PORT = process.env.PORT || 3000;

// ... manter o uncaughtException handler e initBuckets() existentes ...

async function start() {
  try { await initBuckets(); } catch (err) { console.warn('[MinIO]', err.message); }

  const server = http.createServer(app);
  initSocket(server);            // acopla Socket.IO ao mesmo servidor HTTP

  server.listen(PORT, () => {
    console.log(`GuardaApp API + WS rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  });
}

start();
```

> Não usar uma porta separada para o WS. Mesmo processo, mesmo `server`. O Socket.IO sobe em `/socket.io` por padrão.

---

## 5. CAMADA REALTIME

Criar a pasta `src/realtime/` com três arquivos.

### 5.1 `src/realtime/socket.js` — bootstrap e autenticação

Responsabilidades:
- Inicializar o `Server` do Socket.IO com CORS liberado para o app (configurável por env, igual ao CORS do Express).
- **Middleware de handshake**: ler o JWT de `socket.handshake.auth.token` (preferencial) ou do header `Authorization`. Validar com `verifyAccess` (mesmo `src/config/jwt.js` do REST). Em sucesso, anexar `socket.data.userId` e `socket.data.sessionId`. Em falha, `next(new Error('UNAUTHORIZED'))`.
- Resolver a **conexão de co-parentalidade** do usuário (reusar `coparentService.getConnectionForUser(userId)`); guardar `socket.data.connectionId`. Se não houver conexão ativa, recusar (`next(new Error('NO_CONNECTION'))`).
- No `connection`: dar `socket.join(connectionId)` (room por conversa) e também `socket.join('user:' + userId)` (room pessoal, útil para multi-dispositivo).
- Registrar os handlers de evento (ver 5.2).
- Exportar `getIO()` para os serviços emitirem eventos fora do contexto de socket.

Estrutura:

```js
const { Server } = require('socket.io');
const { verifyAccess } = require('../config/jwt');
const coparentService = require('../services/coparentService');
const registerMessageHandlers = require('./messageHandlers');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: process.env.WS_CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccess(token);
      const conn = await coparentService.getConnectionForUser(payload.userId);
      if (!conn) return next(new Error('NO_CONNECTION'));
      socket.data.userId = payload.userId;
      socket.data.sessionId = payload.sessionId;
      socket.data.connectionId = conn.id;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.connectionId);
    socket.join('user:' + socket.data.userId);
    registerMessageHandlers(io, socket);
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO não inicializado');
  return io;
}

module.exports = { initSocket, getIO };
```

### 5.2 `src/realtime/messageHandlers.js` — handlers de eventos do cliente

Registrar handlers para eventos emitidos **pelo cliente**:

| Evento (cliente → servidor) | Payload | Ação |
|---|---|---|
| `message:send` | `{ text, tempId, childId?, replyTo? }` | Caminho realtime de envio. Chama o **mesmo** `messageService.create` + filtro de hostilidade. Ver 5.4. Responde via callback ACK. |
| `message:delivered` | `{ messageId }` ou `{ all: true }` | Destinatário confirma recebimento. Chama `messageService.markDelivered`. Emite `message:status` de volta ao remetente. |
| `message:read` | `{ }` (toda a conversa) ou `{ messageId }` | Destinatário abriu a conversa. Chama `messageService.markRead`. Emite `message:status` (read) ao remetente. |

> O envio também pode continuar acontecendo via REST `POST /messages` (compatibilidade). Independentemente da via, **o servidor sempre emite** `message:new` para a room — ver 5.3. Centralizar a emissão num único helper para não duplicar.

### 5.3 Eventos servidor → cliente (contrato)

| Evento | Quem recebe | Payload | Significado |
|---|---|---|---|
| `message:new` | Room `connectionId` (ambos) | objeto mensagem completo (`id, conversation_id, sender_id, text, hash, is_hostile, created_at, delivered_at, read_at`) + `tempId` (se veio do envio do próprio cliente, para reconciliar otimismo) | Nova mensagem criada |
| `message:status` | Remetente (room `user:<senderId>`) | `{ messageId(s), status: 'delivered' \| 'read', at }` | Atualização de tick |
| `message:hostile` | Apenas o remetente (callback ACK) | `{ tempId, hostile: true, suggestion, messageId }` | Mensagem retida pelo filtro; pode ser forçada |
| `error` | Socket que originou | `{ code, message }` | Falha de validação/autorização |

**Padrão de ACK:** `message:send` usa o callback do Socket.IO (`socket.emit('message:send', payload, (ack) => {...})`). O servidor responde `{ ok: true, message }` ou `{ ok: false, hostile: true, suggestion, messageId }`.

### 5.4 Fluxo de envio realtime (deve reutilizar a lógica REST)

Para não duplicar regra de negócio, extrair o miolo do `sendMessage` do controller para uma função compartilhada (ex.: em `messageService` ou um novo `messageFlow`):

1. Receber `text` (+ `tempId`).
2. Rodar `hostilityFilter.analyze(text)` (a menos que `force`).
3. Se hostil e não forçado → criar a mensagem com `is_hostile = 1`... **ATENÇÃO:** o comportamento atual do controller, quando hostil, **não cria** a mensagem e devolve `suggestion`. Manter coerência: no realtime, replicar exatamente o que o REST faz hoje (retornar `hostile` + `suggestion` sem persistir, e permitir reenvio forçado depois). Documentar claramente o caminho de "forçar envio".
4. Se ok → `messageService.create(connectionId, senderId, text, force)` (mantém hash chain).
5. Após criar: emitir `message:new` para a room `connectionId`.
6. Disparar notificação ao destinatário (ver seção 6) — reusar `notificationService`.
7. Retornar a mensagem no ACK.

> **Regra de ouro:** o `hash` é calculado sobre o conteúdo (`id, text, senderId, timestamp`) — `delivered_at`/`read_at` **não** entram no hash. Logo, atualizar status nunca invalida a trilha de auditoria.

---

## 6. NOTIFICAÇÃO AO DESTINATÁRIO

Comportamento esperado (igual WhatsApp):

- **App aberto e conectado ao WS:** destinatário recebe `message:new` instantaneamente; o cliente então emite `message:delivered`. Sem push.
- **App em background/fechado:** enviar **push notification via Expo**.

### 6.1 Estender `notificationService.notifyNewMessage`

Hoje só persiste uma notificação in-app. Estender para:

1. Persistir a notificação in-app (já faz) — agora com `title`/`body` reais ("Nova mensagem", trecho do texto truncado a ~120 chars; respeitar **modo baixo conflito**: se a conexão estiver em modo protetivo, não revelar nome/foto — usar "Co-parente").
2. Verificar `notification_preferences.push_enabled` do destinatário.
3. Buscar tokens em `push_tokens` do destinatário.
4. Determinar se o destinatário está **online no WS** (consultar `getIO().in('user:'+targetId).fetchSockets()`). Se houver socket ativo na room pessoal, **pular push** (entrega será via WS). Caso contrário, enviar push.
5. Emitir push via `expo-server-sdk` (criar `src/services/pushService.js`).

### 6.2 `src/services/pushService.js`

```js
const { Expo } = require('expo-server-sdk');
const db = require('../config/database');
const expo = new Expo();

async function sendToUser(userId, { title, body, data }) {
  const [tokens] = await db.query('SELECT expo_token FROM push_tokens WHERE user_id = ?', [userId]);
  const messages = tokens
    .filter(t => Expo.isExpoPushToken(t.expo_token))
    .map(t => ({ to: t.expo_token, sound: 'default', title, body, data }));
  if (!messages.length) return;
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try { await expo.sendPushNotificationsAsync(chunk); }
    catch (err) { console.error('[push]', err.message); }
  }
  // Atualizar push_sent_at na notificação correspondente, se aplicável.
}

module.exports = { sendToUser };
```

> `data` deve conter `{ type: 'new_message', connectionId, messageId }` para deep-link no app.

---

## 7. SERVICE — NOVAS FUNÇÕES EM `messageService.js`

Adicionar (mantendo as existentes):

```js
// Marca como entregues todas as mensagens enviadas pelo OUTRO usuário ainda sem delivered_at.
async function markDelivered(connectionId, recipientId) {
  const [r] = await db.query(
    `UPDATE messages
        SET delivered_at = NOW()
      WHERE conversation_id = (SELECT id FROM conversations WHERE connection_id = ?)
        AND sender_id != ?
        AND delivered_at IS NULL
        AND deleted_at IS NULL`,
    [connectionId, recipientId]
  );
  return r.affectedRows;
}
```

Ajustar `markRead` para também garantir `delivered_at` (uma mensagem lida está implicitamente entregue):

```js
async function markRead(connectionId, userId) {
  await db.query(
    `UPDATE messages
        SET delivered_at = COALESCE(delivered_at, NOW()), read_at = NOW()
      WHERE conversation_id = (SELECT id FROM conversations WHERE connection_id = ?)
        AND sender_id != ?
        AND read_at IS NULL`,
    [connectionId, userId]
  );
}
```

Adicionar helper para buscar IDs afetados (para emitir `message:status` com a lista certa), ou — mais simples — emitir `message:status` com `{ scope: 'all', status, at }` e deixar o cliente marcar todas as suas mensagens enviadas como `delivered`/`read`. **Escolher a abordagem `scope: 'all'`** por simplicidade e robustez.

---

## 8. ENDPOINTS REST (novos / ajustes)

Adicionar em `routes/messages.js` (todos sob `auth` + `coparent`):

| Método | Rota | Controller | Função |
|---|---|---|---|
| `PATCH` | `/messages/delivered` | `markDelivered` | Marca como entregues as mensagens recebidas (fallback REST do evento WS). Emite `message:status` via `getIO()`. |
| `PATCH` | `/messages/read` | `markRead` | Marca conversa como lida. Emite `message:status` (read). Cria/atualiza nada na trilha de auditoria. |

Adicionar em `routes/users.js` ou `routes/notifications.js`:

| Método | Rota | Função |
|---|---|---|
| `POST` | `/notifications/push-token` | Registra/atualiza token Expo. Body: `{ expoToken, platform }`. Upsert em `push_tokens` (ON DUPLICATE KEY UPDATE `last_seen_at`). |
| `DELETE` | `/notifications/push-token` | Remove token no logout. Body: `{ expoToken }`. |

**Controllers correspondentes:** após a escrita no banco, sempre emitir o evento WS equivalente via `getIO().to(connectionId).emit(...)` para que o outro dispositivo do remetente também atualize os ticks em tempo real.

---

## 9. SWAGGER + DOC DE EVENTOS

- Documentar os 2 novos endpoints REST de status e os 2 de push token com blocos `@swagger`, no mesmo estilo dos existentes em `routes/messages.js`.
- Criar `backend/REALTIME_EVENTS.md` descrevendo o contrato de eventos WS da seção 5.3 (cliente→servidor e servidor→cliente), payloads, e o fluxo de ticks. Esse documento é a fonte de verdade para o time de frontend.

---

## 10. SEGURANÇA E REGRAS

1. **Autorização por room:** um socket só entra na room da própria `connectionId`. Nunca emitir mensagem de uma conexão para outra. Validar no handshake e em cada handler que `socket.data.connectionId` bate com a conversa alvo.
2. **Imutabilidade:** proibido endpoint/evento que edite ou apague `text`/`hash` de mensagem. `delivered_at`/`read_at` são os únicos campos mutáveis pós-criação.
3. **Modo baixo conflito:** se a conexão tem medida protetiva, push e payloads de notificação **não** revelam nome/foto do co-parente (usar "Co-parente").
4. **Rate limiting:** aplicar limite por usuário no `message:send` (ex.: token bucket simples em memória ou reusar a política do `rateLimiter`), evitando flood.
5. **Reconexão:** ao reconectar, o cliente chama `GET /messages` (REST) para sincronizar histórico e emite `message:delivered { all: true }`. O servidor não precisa de buffer de eventos perdidos — o REST é a fonte de verdade do histórico.
6. **Multi-dispositivo:** emitir status para a room `user:<senderId>` (todas as sessões do remetente), não só para o socket originador.
7. **LGPD:** push tokens são dado pessoal — incluí-los na exportação/exclusão de dados do titular (rotas LGPD existentes) e apagá-los no `ON DELETE CASCADE` do usuário (já contemplado no schema).

---

## 11. CRITÉRIOS DE ACEITE

- [ ] `npm run migrate` aplica `021_message_realtime.sql` sem erro; `delivered_at` e `push_tokens` existem.
- [ ] Socket.IO sobe no mesmo PORT do Express; handshake sem JWT válido é rejeitado.
- [ ] Enviar mensagem (via WS ou REST) emite `message:new` para ambos os participantes da conexão em < 1s.
- [ ] Filtro de hostilidade continua barrando/sugerindo exatamente como no fluxo REST atual; "forçar envio" funciona via WS.
- [ ] Destinatário com app aberto recebe a mensagem por WS e o remetente vê tick mudar para "entregue" (✓✓ cinza) e depois "lido" (✓✓ azul).
- [ ] Destinatário com app fechado recebe push Expo com deep-link; remetente continua vendo "enviado" até a entrega.
- [ ] `hash`/`previous_hash` das mensagens não muda ao marcar entregue/lido (auditoria intacta).
- [ ] Exportação PDF da conversa continua funcionando.
- [ ] Endpoints REST antigos de mensagens permanecem 100% compatíveis.

---

## 12. ENTREGÁVEIS

```
backend/
├── migrations/021_message_realtime.sql           (novo)
├── server.js                                      (refatorado: http.createServer + initSocket)
├── package.json                                   (socket.io, expo-server-sdk)
├── REALTIME_EVENTS.md                             (novo — contrato de eventos)
├── src/
│   ├── realtime/
│   │   ├── socket.js                              (novo)
│   │   └── messageHandlers.js                     (novo)
│   ├── services/
│   │   ├── messageService.js                      (markDelivered + markRead ajustado)
│   │   ├── notificationService.js                 (notifyNewMessage estendido c/ push + checagem de presença WS)
│   │   └── pushService.js                         (novo)
│   ├── controllers/
│   │   ├── messageController.js                   (markDelivered, markRead + emissão WS)
│   │   └── notificationController.js              (registerPushToken, removePushToken)
│   └── routes/
│       ├── messages.js                            (PATCH /delivered, PATCH /read + Swagger)
│       └── notifications.js                       (POST/DELETE /push-token + Swagger)
└── .env.example                                   (WS_CORS_ORIGIN, EXPO_ACCESS_TOKEN se usado)
```

**Não tocar** em: hashChain, hostilityFilter, pdfExport, demais módulos (events, expenses, documents, health, vaccines, milestones, lgpd, audit) — exceto a inclusão de push tokens na exportação/exclusão LGPD.
