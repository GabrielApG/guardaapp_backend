# GuardaApp — Contrato de Eventos WebSocket (Socket.IO)

> **Versão:** 1.0 · **Protocolo:** Socket.IO v4 · **Transport:** WebSocket (com fallback polling)
>
> Este documento é a **fonte de verdade** para o contrato de comunicação realtime entre o app mobile (React Native) e o servidor. Manter sincronizado com `src/realtime/messageHandlers.js`.

---

## Conexão e Autenticação

```js
// Cliente (React Native)
import { io } from 'socket.io-client';

const socket = io(WS_URL, {
  auth: { token: '<JWT access token>' },
  transports: ['websocket'],
  reconnection: true,
});
```

O servidor valida o JWT no handshake via `socket.handshake.auth.token`.

| Erro de handshake | Significado |
|---|---|
| `UNAUTHORIZED` | Token ausente, inválido ou expirado |
| `NO_CONNECTION` | Usuário autenticado, mas sem conexão de co-parentalidade ativa |

Após conexão bem-sucedida, o socket entra em duas **rooms**:
- `<connectionId>` — compartilhada com o co-parente (entrega de mensagens)
- `user:<userId>` — privada (multi-dispositivo; atualização de ticks)

---

## Eventos: Cliente → Servidor

### `message:send`

Envia uma mensagem de texto. Responde via callback ACK.

```ts
// Payload
{
  text:    string;       // obrigatório, máximo 4000 chars
  tempId:  string;       // ID temporário gerado pelo cliente para reconciliação otimista
  force?:  boolean;      // true = forçar envio de msg sinalizada como hostil
  childId?: string;      // ID do filho relacionado (opcional)
  replyTo?: string;      // ID da mensagem original (reply — opcional)
}

// ACK de sucesso
{ ok: true, message: Message }

// ACK de hostilidade
{ ok: false, hostile: true, suggestion: string, messageId: null }

// ACK de erro
{ ok: false, error: 'RATE_LIMIT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR', message: string }
```

**Rate limit:** 10 mensagens / 10 segundos por socket.

---

### `message:delivered`

Informa ao servidor que o destinatário recebeu as mensagens (app aberto).
O servidor atualiza `delivered_at` e emite `message:status` ao remetente.

```ts
// Payload (marcar todas)
{ all: true }

// Payload (marcar uma específica — uso futuro)
{ messageId: string }
```

> Chamar ao receber `message:new` quando o app está em foreground.

---

### `message:read`

Informa que o destinatário abriu a conversa e leu as mensagens.
O servidor atualiza `read_at` e `delivered_at` (se ausente) e emite `message:status` (read) ao remetente.

```ts
// Payload — sem campos obrigatórios, marca toda a conversa
{}
```

> Chamar ao montar a tela de conversa.

---

## Eventos: Servidor → Cliente

### `message:new`

Emitido para a room `<connectionId>` (ambos os participantes) quando uma nova mensagem é criada.

```ts
{
  id:              string;
  conversation_id: string;
  sender_id:       string;
  text:            string;
  hash:            string;       // SHA-256 encadeado — nunca muda
  is_hostile:      boolean;
  forced_send:     boolean;
  created_at:      string;       // ISO 8601
  delivered_at:    string | null;
  read_at:         string | null;
  tempId:          string | null; // ecoa o tempId do cliente para reconciliar envio otimista
}
```

**Reconciliação otimista:** ao receber `message:new`, o cliente verifica se existe uma mensagem local com `_tempId === tempId`. Se sim, **substitui** a bubble otimista pela mensagem do servidor (com `id` e `hash` reais). Se não, **appenda** ao final da lista.

---

### `message:status`

Emitido para a room `user:<senderId>` quando o destinatário entrega ou lê as mensagens.
O remetente deve atualizar os ticks de **todas** as suas mensagens enviadas.

```ts
{
  scope:  'all';                  // sempre 'all' nesta versão
  status: 'delivered' | 'read';
  at:     string;                 // ISO 8601 — timestamp da ação
}
```

| `status`    | Ação no cliente |
|---|---|
| `delivered` | Setar `delivered_at = at` em todas as msgs do remetente sem `delivered_at` |
| `read`      | Setar `delivered_at = at` (se null) **e** `read_at = at` em todas as msgs do remetente |

---

## Fluxo de Ticks (3 estados)

```
Remetente envia                          Destinatário
     │                                        │
     │── message:send ──► ACK {ok:true} ──────│  → created_at preenchido
     │   bubble local: tick = "sending"        │
     │                                        │
     │◄─── message:new (para ambos) ──────────│  → tick remetente: "sent" (✓ cinza)
     │                                        │
     │                         app abre/recebe│
     │                    ◄── message:delivered│  → emit message:status {delivered}
     │◄── message:status {delivered} ─────────│  → tick remetente: "entregue" (✓✓ cinza)
     │                                        │
     │                      abre a conversa  │
     │                    ◄─── message:read   │  → emit message:status {read}
     │◄── message:status {read} ──────────────│  → tick remetente: "lido" (✓✓ azul)
```

### Estados de tick no cliente

| `_sending` | `delivered_at` | `read_at` | Ícone | Cor |
|---|---|---|---|---|
| `true`  | —       | —       | `time-outline`   | rgba(255,255,255,0.6) |
| `false` | `null`  | `null`  | `checkmark`      | rgba(255,255,255,0.6) |
| `false` | filled  | `null`  | `checkmark-done` | rgba(255,255,255,0.6) |
| `false` | filled  | filled  | `checkmark-done` | `#53BDEB` (azul leitura) |

---

## Reconexão

Ao reconectar (`connect` event):
1. O cliente emite `message:read` para re-sincronizar estado de leitura.
2. O cliente chama `GET /messages` (REST) para obter mensagens perdidas durante a desconexão.
3. O servidor não mantém buffer de eventos — o REST é a fonte de verdade do histórico.

---

## Modo Baixo Conflito (medida protetiva)

Quando a conexão tem `protective_order = 1`:
- Push notifications **não revelam** nome/foto do remetente.
- Título da push: `"Nova mensagem"`.
- Corpo da push: `"Você tem uma nova mensagem no GuardaApp."`.
- O payload `message:new` continua com `sender_id` real (necessário para renderizar a bolha corretamente), mas o **app** esconde o nome/avatar usando o flag `lowConflictMode` do usuário.

---

## Endpoints REST Relacionados

| Método | Rota | Equivalente WS |
|---|---|---|
| `PATCH /messages/delivered` | Marcar entregue (fallback) | `message:delivered` |
| `POST /messages/read-all` | Marcar lido (fallback) | `message:read` |
| `POST /notifications/push-token` | Registrar token Expo | — |
| `DELETE /notifications/push-token` | Remover token (logout) | — |
| `GET /messages/unread-count` | Contar não lidas | — |
