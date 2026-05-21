# GuardaApp — Arquitetura de Rotas, Controllers e Services

> Mapeamento completo de cada endpoint HTTP → função do controller → services internos chamados.
> Convenção de nomenclatura: **camelCase** para funções, **kebab-case** para arquivos.

---

## Legenda de Middleware

| Símbolo | Middleware | Descrição |
|---------|-----------|-----------|
| `🔐` | `auth` | Valida JWT; injeta `req.userId` |
| `👫` | `coparent` | Valida que existe conexão ativa entre os usuários |
| `📝` | `auditLogger` | Registra evento de auditoria após resposta |
| `🚦` | `rateLimiter` | Limite de requisições por IP/userId |
| `📤` | `multer` | Parse de multipart/form-data (upload de arquivo) |

---

## Estrutura de Arquivos

```
src/
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── sessions.js
│   ├── children.js
│   ├── coparent.js
│   ├── events.js
│   ├── messages.js
│   ├── expenses.js
│   ├── documents.js
│   ├── health.js
│   ├── vaccines.js
│   ├── milestones.js
│   ├── audit.js
│   ├── notifications.js
│   └── lgpd.js
│
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── sessionController.js
│   ├── childController.js
│   ├── coparentController.js
│   ├── eventController.js
│   ├── messageController.js
│   ├── expenseController.js
│   ├── documentController.js
│   ├── healthController.js
│   ├── vaccineController.js
│   ├── milestoneController.js
│   ├── auditController.js
│   ├── notificationController.js
│   └── lgpdController.js
│
└── services/
    ├── authService.js
    ├── userService.js
    ├── sessionService.js
    ├── childService.js
    ├── coparentService.js
    ├── eventService.js
    ├── messageService.js
    ├── expenseService.js
    ├── documentService.js
    ├── healthService.js
    ├── vaccineService.js
    ├── milestoneService.js
    ├── auditService.js
    ├── notificationService.js
    ├── lgpdService.js
    ├── hashChain.js        ← service interno: SHA-256 encadeado
    ├── hostilityFilter.js  ← service interno: análise de linguagem
    ├── pdfExport.js        ← service interno: geração de PDF assinado
    └── storage.js          ← service interno: MinIO upload/download
```

---

## 1. Módulo: Auth

**Arquivo de rota:** `src/routes/auth.js`
**Controller:** `src/controllers/authController.js`
**Service principal:** `src/services/authService.js`

```
Base path: /api/v1/auth
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `POST` | `/register` | `🚦` | `register` | `authService.createUser` → `userService.findByEmail`, `userService.findByCpf`, `authService.hashPassword`, `authService.generateEmailToken`, `notificationService.sendVerificationEmail` |
| `POST` | `/login` | `🚦` | `login` | `authService.validateCredentials` → `userService.findByEmail`, `authService.comparePassword`, `sessionService.createSession`, `authService.generateTokenPair` |
| `POST` | `/refresh` | `🚦` | `refreshToken` | `sessionService.findByRefreshToken`, `sessionService.rotateRefreshToken`, `authService.generateTokenPair` |
| `POST` | `/logout` | `🔐` | `logout` | `sessionService.revokeSession` |
| `POST` | `/logout-all` | `🔐` | `logoutAll` | `sessionService.revokeAllSessions` |
| `GET` | `/verify-email/:token` | — | `verifyEmail` | `authService.consumeEmailToken` → `userService.markEmailVerified` |
| `POST` | `/forgot-password` | `🚦` | `forgotPassword` | `userService.findByEmail`, `authService.generateResetToken`, `notificationService.sendPasswordResetEmail` |
| `POST` | `/reset-password` | `🚦` | `resetPassword` | `authService.validateResetToken`, `authService.hashPassword`, `userService.updatePassword`, `sessionService.revokeAllSessions` |

### authService.js — funções exportadas

```js
createUser(data)              // valida CPF, hash de senha, insert em users
validateCredentials(email, pw) // findByEmail + bcrypt.compare
hashPassword(plain)            // bcrypt.hash com salt 12
comparePassword(plain, hash)   // bcrypt.compare
generateTokenPair(userId)      // gera accessToken (15m) + refreshToken (30d)
generateEmailToken()           // crypto.randomBytes(32).toString('hex')
consumeEmailToken(token)       // busca e invalida token de verificação
generateResetToken(userId)     // salva hash no users.reset_token + expiry
validateResetToken(token)      // verifica hash e expiração
```

---

## 2. Módulo: Users

**Arquivo de rota:** `src/routes/users.js`
**Controller:** `src/controllers/userController.js`
**Service principal:** `src/services/userService.js`

```
Base path: /api/v1/users
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/me` | `🔐` | `getMe` | `userService.findById` |
| `PATCH` | `/me` | `🔐` `📝` | `updateMe` | `userService.updateProfile` |
| `POST` | `/me/avatar` | `🔐` `📤` `📝` | `uploadAvatar` | `storage.uploadAvatar`, `userService.updateAvatarUrl` |
| `DELETE` | `/me/avatar` | `🔐` `📝` | `deleteAvatar` | `storage.deleteFile`, `userService.clearAvatarUrl` |
| `PATCH` | `/me/low-conflict` | `🔐` `📝` | `toggleLowConflict` | `userService.setLowConflictMode` |
| `GET` | `/me/coparent` | `🔐` `👫` | `getCoparent` | `coparentService.getConnectionForUser`, `userService.findById` (aplica baixo conflito) |

### userService.js — funções exportadas

```js
findById(id)                      // SELECT * FROM users WHERE id = ? AND deleted_at IS NULL
findByEmail(email)                // SELECT * FROM users WHERE email = ?
findByCpf(cpf)                   // SELECT * FROM users WHERE cpf = ?
updateProfile(userId, data)       // UPDATE users SET name, phone, role, custody_type
updatePassword(userId, hash)      // UPDATE users SET password_hash
updateAvatarUrl(userId, url)      // UPDATE users SET avatar_url
clearAvatarUrl(userId)            // UPDATE users SET avatar_url = NULL
markEmailVerified(userId)         // UPDATE users SET email_verified_at = NOW()
setLowConflictMode(userId, bool)  // UPDATE users SET low_conflict_mode
softDelete(userId)                // UPDATE users SET deleted_at = NOW() (LGPD)
anonymize(userId)                 // Substitui nome/email/cpf por hashes (LGPD art. 18)
```

---

## 3. Módulo: Sessions

**Arquivo de rota:** `src/routes/sessions.js`
**Controller:** `src/controllers/sessionController.js`
**Service principal:** `src/services/sessionService.js`

```
Base path: /api/v1/sessions
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` | `listSessions` | `sessionService.listActiveByUser` |
| `DELETE` | `/:sessionId` | `🔐` `📝` | `revokeSession` | `sessionService.revokeById` (valida ownership) |
| `DELETE` | `/` | `🔐` `📝` | `revokeAllSessions` | `sessionService.revokeAllSessions` (exceto current) |

### sessionService.js — funções exportadas

```js
createSession(userId, deviceInfo, refreshToken)  // INSERT INTO user_sessions
findByRefreshToken(tokenHash)                    // busca + valida not revoked, not expired
rotateRefreshToken(sessionId, newToken)          // UPDATE refresh_token_hash + last_seen_at
listActiveByUser(userId)                         // SELECT where revoked_at IS NULL, not expired
revokeById(sessionId, userId)                    // UPDATE revoked_at = NOW() (checa ownership)
revokeAllSessions(userId, exceptSessionId?)      // UPDATE ALL revoked_at = NOW()
```

---

## 4. Módulo: Children

**Arquivo de rota:** `src/routes/children.js`
**Controller:** `src/controllers/childController.js`
**Service principal:** `src/services/childService.js`

```
Base path: /api/v1/children
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listChildren` | `childService.listByConnection` |
| `POST` | `/` | `🔐` `👫` `📝` | `createChild` | `childService.create` |
| `GET` | `/:childId` | `🔐` `👫` | `getChild` | `childService.findById` |
| `PATCH` | `/:childId` | `🔐` `👫` `📝` | `updateChild` | `childService.update` |
| `DELETE` | `/:childId` | `🔐` `👫` `📝` | `deleteChild` | `childService.softDelete` |
| `POST` | `/:childId/avatar` | `🔐` `👫` `📤` `📝` | `uploadAvatar` | `storage.uploadAvatar`, `childService.updateAvatarUrl` |

### childService.js — funções exportadas

```js
listByConnection(connectionId)             // SELECT * WHERE connection_id = ? AND is_active = 1
findById(childId, connectionId)            // valida pertencimento à conexão
create(connectionId, data)                 // INSERT INTO children
update(childId, connectionId, data)        // UPDATE children SET ...
softDelete(childId, connectionId)          // UPDATE is_active = 0
updateAvatarUrl(childId, connectionId, url)// UPDATE avatar_url
```

---

## 5. Módulo: Co-parent Connection

**Arquivo de rota:** `src/routes/coparent.js`
**Controller:** `src/controllers/coparentController.js`
**Service principal:** `src/services/coparentService.js`

```
Base path: /api/v1/coparent
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `POST` | `/invite` | `🔐` `📝` | `sendInvite` | `coparentService.createInvite`, `notificationService.sendInviteEmail` |
| `POST` | `/accept` | `🔐` `📝` | `acceptInvite` | `coparentService.acceptByCode` → valida código, vincula user_id_b |
| `GET` | `/connection` | `🔐` | `getConnection` | `coparentService.getConnectionForUser` |
| `PATCH` | `/connection/protective-order` | `🔐` `📝` | `toggleProtectiveOrder` | `coparentService.setProtectiveOrder` |
| `POST` | `/connection/terminate` | `🔐` `📝` | `terminateConnection` | `coparentService.terminate` |

### coparentService.js — funções exportadas

```js
createInvite(userId, inviteEmail)           // gera invite_code único, INSERT coparent_connections
acceptByCode(userId, code)                  // valida code, SET user_id_b = userId, status = active
getConnectionForUser(userId)                // SELECT where user_id_a = ? OR user_id_b = ? AND status = active
getConnectionById(connectionId)             // SELECT by PK
setProtectiveOrder(connectionId, bool)      // UPDATE protective_order
terminate(connectionId, userId, reason)     // UPDATE status = terminated, terminated_reason
validateMembership(connectionId, userId)    // confirma que userId é membro da conexão
```

---

## 6. Módulo: Events (Calendário)

**Arquivo de rota:** `src/routes/events.js`
**Controller:** `src/controllers/eventController.js`
**Service principal:** `src/services/eventService.js`

```
Base path: /api/v1/events
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listEvents` | `eventService.listByConnection` (query: `month`, `childId`, `type`) |
| `POST` | `/` | `🔐` `👫` `📝` | `createEvent` | `eventService.create`, `notificationService.notifyCoparent` |
| `GET` | `/:eventId` | `🔐` `👫` | `getEvent` | `eventService.findById` |
| `PATCH` | `/:eventId` | `🔐` `👫` `📝` | `updateEvent` | `eventService.update` (só o criador pode editar) |
| `DELETE` | `/:eventId` | `🔐` `👫` `📝` | `deleteEvent` | `eventService.softDelete` |
| `POST` | `/:eventId/confirm` | `🔐` `👫` `📝` | `confirmEvent` | `eventService.setConfirmation(eventId, userId, 'confirmed')`, `notificationService.notifyCoparent` |
| `POST` | `/:eventId/decline` | `🔐` `👫` `📝` | `declineEvent` | `eventService.setConfirmation(eventId, userId, 'declined')`, `notificationService.notifyCoparent` |

### eventService.js — funções exportadas

```js
listByConnection(connectionId, filters)      // SELECT com filtros de mês, childId, type
findById(eventId, connectionId)              // valida pertencimento
create(connectionId, createdBy, data)        // INSERT INTO events, INSERT event_confirmations (ambos pendente)
update(eventId, userId, data)               // checa createdBy, UPDATE events
softDelete(eventId, userId)                 // UPDATE deleted_at (só criador)
setConfirmation(eventId, userId, status)    // UPDATE event_confirmations WHERE event_id + user_id
getConfirmations(eventId)                   // SELECT FROM event_confirmations WHERE event_id
```

---

## 7. Módulo: Messages

**Arquivo de rota:** `src/routes/messages.js`
**Controller:** `src/controllers/messageController.js`
**Service principal:** `src/services/messageService.js`

```
Base path: /api/v1/messages
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listMessages` | `messageService.listByConnection` (paginado, query: `before`, `limit`) |
| `POST` | `/` | `🔐` `👫` `📝` | `sendMessage` | `hostilityFilter.analyze`, `messageService.create`, `notificationService.notifyNewMessage` |
| `GET` | `/:messageId` | `🔐` `👫` | `getMessage` | `messageService.findById` |
| `POST` | `/:messageId/force` | `🔐` `👫` `📝` | `forceSend` | `messageService.markForcedSend` (mensagem hostil forçada pelo usuário) |
| `GET` | `/export/pdf` | `🔐` `👫` | `exportPdf` | `messageService.listAll`, `pdfExport.generateMessagesPdf`, `storage.uploadExport` |

### messageService.js — funções exportadas

```js
listByConnection(connectionId, cursor, limit)   // SELECT paginado com cursor (id < before)
findById(messageId, connectionId)               // valida pertencimento
create(connectionId, senderId, body, isForced)  // INSERT INTO messages
markForcedSend(messageId, connectionId)         // UPDATE forced_send = 1 (re-envia com flag)
listAll(connectionId)                           // SELECT * sem paginação (para export PDF)
markRead(connectionId, userId)                  // UPDATE read_at WHERE receiver_id = userId
```

---

## 8. Módulo: Expenses

**Arquivo de rota:** `src/routes/expenses.js`
**Controller:** `src/controllers/expenseController.js`
**Service principal:** `src/services/expenseService.js`

```
Base path: /api/v1/expenses
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listExpenses` | `expenseService.listByConnection` (query: `status`, `childId`, `month`) |
| `POST` | `/` | `🔐` `👫` `📝` | `createExpense` | `expenseService.create`, `notificationService.notifyNewExpense` |
| `GET` | `/:expenseId` | `🔐` `👫` | `getExpense` | `expenseService.findById` |
| `PATCH` | `/:expenseId` | `🔐` `👫` `📝` | `updateExpense` | `expenseService.update` (só pending + criador) |
| `DELETE` | `/:expenseId` | `🔐` `👫` `📝` | `deleteExpense` | `expenseService.softDelete` (só pending + criador) |
| `POST` | `/:expenseId/approve` | `🔐` `👫` `📝` | `approveExpense` | `expenseService.setStatus('approved')`, `notificationService.notifyCoparent` |
| `POST` | `/:expenseId/contest` | `🔐` `👫` `📝` | `contestExpense` | `expenseService.setStatus('contested', reason)`, `notificationService.notifyCoparent` |
| `POST` | `/:expenseId/pay` | `🔐` `👫` `📤` `📝` | `registerPayment` | `expenseService.registerPayment`, `storage.uploadReceipt` |
| `POST` | `/receipt/:expenseId` | `🔐` `👫` `📤` `📝` | `uploadReceipt` | `storage.uploadReceipt`, `expenseService.attachReceipt` |
| `GET` | `/summary` | `🔐` `👫` | `getSummary` | `expenseService.getSummaryByMonth` (totais por status) |

### expenseService.js — funções exportadas

```js
listByConnection(connectionId, filters)            // SELECT com filtros + calcular myShare
findById(expenseId, connectionId)                  // valida pertencimento
create(connectionId, submittedBy, data)            // INSERT INTO expenses
update(expenseId, userId, data)                    // checa ownership + status pending
softDelete(expenseId, userId)                      // UPDATE deleted_at
setStatus(expenseId, userId, status, reason?)      // UPDATE status + contest_reason
registerPayment(expenseId, userId, paymentData)    // UPDATE status=paid, payment_method, paid_at
attachReceipt(expenseId, receiptKey)               // UPDATE receipt_url
getSummaryByMonth(connectionId, month)             // GROUP BY status + SUM amount
calculateShare(amount, split)                      // '60/40' → { mine, theirs }
```

---

## 9. Módulo: Documents (Cofre)

**Arquivo de rota:** `src/routes/documents.js`
**Controller:** `src/controllers/documentController.js`
**Service principal:** `src/services/documentService.js`

```
Base path: /api/v1/documents
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listDocuments` | `documentService.listByConnection` (query: `category`, `search`) |
| `POST` | `/` | `🔐` `👫` `📤` `📝` | `uploadDocument` | `storage.uploadDocument`, `documentService.create` |
| `GET` | `/:docId` | `🔐` `👫` | `getDocument` | `documentService.findById`, `documentService.logAccess` |
| `GET` | `/:docId/url` | `🔐` `👫` | `getPresignedUrl` | `documentService.findById`, `storage.generatePresignedUrl(1h)` |
| `PATCH` | `/:docId` | `🔐` `👫` `📝` | `updateDocument` | `documentService.update` (nome, descrição, visibilidade) |
| `DELETE` | `/:docId` | `🔐` `👫` `📝` | `deleteDocument` | `storage.deleteFile`, `documentService.softDelete` |
| `GET` | `/:docId/access-log` | `🔐` `👫` | `getAccessLog` | `documentService.getAccessLog` |

### documentService.js — funções exportadas

```js
listByConnection(connectionId, filters)         // SELECT com filtros de categoria e busca full-text
findById(docId, connectionId)                   // valida pertencimento
create(connectionId, uploadedBy, data, key)     // INSERT INTO documents com storage_key
update(docId, userId, data)                     // UPDATE name, description, visibility
softDelete(docId, connectionId)                 // UPDATE deleted_at
logAccess(docId, userId)                        // INSERT INTO document_access_log
getAccessLog(docId, connectionId)               // SELECT access_log WHERE doc_id
```


---

## 10. Módulo: Health (Saúde)

**Arquivo de rota:** `src/routes/health.js`
**Controller:** `src/controllers/healthController.js`
**Service principal:** `src/services/healthService.js`

```
Base path: /api/v1/health
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/:childId` | `🔐` `👫` | `listEntries` | `healthService.listByChild` (query: `type`, `limit`) |
| `POST` | `/:childId` | `🔐` `👫` `📝` | `createEntry` | `healthService.create`, `notificationService.notifyCoparent` |
| `GET` | `/:childId/:entryId` | `🔐` `👫` | `getEntry` | `healthService.findById` |
| `PATCH` | `/:childId/:entryId` | `🔐` `👫` `📝` | `updateEntry` | `healthService.update` |
| `DELETE` | `/:childId/:entryId` | `🔐` `👫` `📝` | `deleteEntry` | `healthService.softDelete` |

### healthService.js — funções exportadas

```js
listByChild(childId, connectionId, filters)     // SELECT WHERE child_id + filtros de tipo
findById(entryId, childId, connectionId)        // valida pertencimento duplo
create(childId, connectionId, registeredBy, data) // INSERT INTO health_entries
update(entryId, childId, data)                  // UPDATE campos opcionais
softDelete(entryId, childId)                    // UPDATE deleted_at
```

---

## 11. Módulo: Vaccines (Vacinação PNI)

**Arquivo de rota:** `src/routes/vaccines.js`
**Controller:** `src/controllers/vaccineController.js`
**Service principal:** `src/services/vaccineService.js`

```
Base path: /api/v1/vaccines
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/:childId` | `🔐` `👫` | `getVaccineCard` | `vaccineService.getCardWithStatus` |
| `GET` | `/:childId/doses` | `🔐` `👫` | `listDoses` | `vaccineService.listDosesByChild` |
| `POST` | `/:childId/doses` | `🔐` `👫` `📝` | `logDose` | `vaccineService.logDose`, `notificationService.notifyCoparent` |
| `PATCH` | `/:childId/doses/:doseId` | `🔐` `👫` `📝` | `updateDose` | `vaccineService.updateDose` |
| `DELETE` | `/:childId/doses/:doseId` | `🔐` `👫` `📝` | `deleteDose` | `vaccineService.softDelete` |
| `GET` | `/:childId/pending` | `🔐` `👫` | `getPendingVaccines` | `vaccineService.getPendingByAge` (cruza com PNI por idade do filho) |

### vaccineService.js — funções exportadas

```js
getCardWithStatus(childId, connectionId)        // lista todas as vacinas PNI + doses registradas
listDosesByChild(childId, connectionId)         // SELECT vaccine_doses WHERE child_id
logDose(childId, connectionId, registeredBy, data) // INSERT INTO vaccine_doses
updateDose(doseId, childId, data)               // UPDATE batch, appliedAt, clinic
softDelete(doseId, childId)                     // UPDATE deleted_at
getPendingByAge(childId, connectionId)          // calcula idade, retorna vacinas PNI pendentes
getVaccineTemplate(vaccineCode)                 // SELECT FROM pni_vaccines WHERE code (tabela estática)
```

---

## 12. Módulo: Milestones (Diário)

**Arquivo de rota:** `src/routes/milestones.js`
**Controller:** `src/controllers/milestoneController.js`
**Service principal:** `src/services/milestoneService.js`

```
Base path: /api/v1/milestones
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/:childId` | `🔐` `👫` | `listMilestones` | `milestoneService.listByChild` (paginado por cursor) |
| `POST` | `/:childId` | `🔐` `👫` `📝` | `createMilestone` | `milestoneService.create`, `notificationService.notifyCoparent` |
| `GET` | `/:childId/:milestoneId` | `🔐` `👫` | `getMilestone` | `milestoneService.findById` |
| `PATCH` | `/:childId/:milestoneId` | `🔐` `👫` `📝` | `updateMilestone` | `milestoneService.update` (só criador) |
| `DELETE` | `/:childId/:milestoneId` | `🔐` `👫` `📝` | `deleteMilestone` | `storage.deleteFile`, `milestoneService.softDelete` |
| `POST` | `/:childId/:milestoneId/photos` | `🔐` `👫` `📤` `📝` | `addPhoto` | `storage.uploadMilestonePhoto`, `milestoneService.attachPhoto` |
| `DELETE` | `/:childId/:milestoneId/photos/:photoId` | `🔐` `👫` `📝` | `deletePhoto` | `storage.deleteFile`, `milestoneService.removePhoto` |

### milestoneService.js — funções exportadas

```js
listByChild(childId, connectionId, cursor, limit) // SELECT paginado + JOIN photos
findById(milestoneId, childId, connectionId)      // valida pertencimento
create(childId, connectionId, registeredBy, data) // INSERT INTO milestones
update(milestoneId, userId, data)                 // checa ownership, UPDATE
softDelete(milestoneId, userId)                   // UPDATE deleted_at
attachPhoto(milestoneId, storageKey, caption)     // INSERT INTO milestone_photos
removePhoto(photoId, milestoneId)                 // UPDATE milestone_photos SET deleted_at
```

---

## 13. Módulo: Audit

**Arquivo de rota:** `src/routes/audit.js`
**Controller:** `src/controllers/auditController.js`
**Service principal:** `src/services/auditService.js`

```
Base path: /api/v1/audit
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` `👫` | `listEvents` | `auditService.listByConnection` (query: `type`, `actorId`, `limit`, `before`) |
| `GET` | `/:eventId` | `🔐` `👫` | `getEvent` | `auditService.findById` (inclui hash + hash anterior) |
| `POST` | `/verify` | `🔐` `👫` | `verifyChain` | `auditService.verifyChainIntegrity` (recalcula hashes e compara) |
| `POST` | `/export` | `🔐` `👫` | `requestExport` | `auditService.createExportJob`, `pdfExport.generateAuditPdf`, `storage.uploadExport(24h)` |
| `GET` | `/export/:jobId` | `🔐` `👫` | `getExportStatus` | `auditService.getExportJob` (retorna URL presigned se pronto) |

### auditService.js — funções exportadas

```js
listByConnection(connectionId, filters)          // SELECT paginado com cursor
findById(eventId, connectionId)                  // valida pertencimento
log(connectionId, actorId, eventType, metadata)  // INSERT com hash encadeado via hashChain
verifyChainIntegrity(connectionId)               // recalcula toda a cadeia, retorna bool + count
createExportJob(connectionId, userId, dateRange) // INSERT INTO audit_exports (status=pending)
getExportJob(jobId, connectionId)                // SELECT + presigned URL se completed
```

### hashChain.js — funções exportadas

```js
computeHash(eventData, previousHash)   // SHA-256( JSON.stringify(eventData) + previousHash )
getLastHash(connectionId)              // SELECT hash FROM audit_events ORDER BY created_at DESC LIMIT 1
verifyHash(eventData, storedHash)      // recalcula e compara
```

---

## 14. Módulo: Notifications

**Arquivo de rota:** `src/routes/notifications.js`
**Controller:** `src/controllers/notificationController.js`
**Service principal:** `src/services/notificationService.js`

```
Base path: /api/v1/notifications
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/` | `🔐` | `listNotifications` | `notificationService.listByUser` (query: `unread`, `limit`) |
| `GET` | `/unread-count` | `🔐` | `getUnreadCount` | `notificationService.countUnread` |
| `PATCH` | `/:notifId/read` | `🔐` | `markRead` | `notificationService.markRead` |
| `PATCH` | `/read-all` | `🔐` | `markAllRead` | `notificationService.markAllRead` |
| `DELETE` | `/:notifId` | `🔐` | `deleteNotification` | `notificationService.softDelete` |
| `GET` | `/preferences` | `🔐` | `getPreferences` | `notificationService.getPreferences` |
| `PATCH` | `/preferences` | `🔐` `📝` | `updatePreferences` | `notificationService.updatePreferences` |

### notificationService.js — funções exportadas

```js
listByUser(userId, filters)                   // SELECT WHERE user_id + filtros
countUnread(userId)                           // SELECT COUNT WHERE read_at IS NULL
markRead(notifId, userId)                     // UPDATE read_at = NOW()
markAllRead(userId)                           // UPDATE ALL WHERE user_id + unread
softDelete(notifId, userId)                   // UPDATE deleted_at
getPreferences(userId)                        // SELECT FROM notification_preferences
updatePreferences(userId, prefs)              // UPSERT notification_preferences

// Funções de envio (chamadas por outros services):
notifyCoparent(connectionId, actorId, type, payload) // cria notification para o outro lado
notifyNewMessage(connectionId, senderId)              // type = 'new_message'
notifyNewExpense(connectionId, submitterId)           // type = 'new_expense'
notifyEventChange(connectionId, actorId, eventId)    // type = 'event_update'
sendVerificationEmail(userId, token)                 // dispara e-mail via nodemailer
sendPasswordResetEmail(userId, token)                // dispara e-mail via nodemailer
sendInviteEmail(email, inviteCode)                   // dispara e-mail de convite
sendWeeklyDigest(userId)                             // resumo semanal (cron job)
```

---

## 15. Módulo: LGPD

**Arquivo de rota:** `src/routes/lgpd.js`
**Controller:** `src/controllers/lgpdController.js`
**Service principal:** `src/services/lgpdService.js`

```
Base path: /api/v1/lgpd
```

| Método | Endpoint | Middleware | Controller fn | Services chamados |
|--------|----------|------------|---------------|-------------------|
| `GET` | `/consents` | `🔐` | `listConsents` | `lgpdService.listConsents` |
| `PATCH` | `/consents/:type` | `🔐` `📝` | `updateConsent` | `lgpdService.updateConsent` (valida se é revogável) |
| `POST` | `/data-export` | `🔐` | `requestDataExport` | `lgpdService.createExportJob`, `lgpdService.compileUserData`, `storage.uploadExport` |
| `GET` | `/data-export/:jobId` | `🔐` | `getDataExportStatus` | `lgpdService.getExportJob` |
| `POST` | `/delete-account` | `🔐` `📝` | `requestAccountDeletion` | `lgpdService.initiateAccountDeletion` → `sessionService.revokeAllSessions`, `userService.anonymize` |

### lgpdService.js — funções exportadas

```js
listConsents(userId)                       // SELECT FROM user_consents WHERE user_id
updateConsent(userId, type, granted)       // UPSERT + valida se consent é obrigatório (403 se sim)
createExportJob(userId)                    // INSERT INTO lgpd_export_jobs
compileUserData(userId)                    // agrega dados de todas as tabelas para o usuário
getExportJob(jobId, userId)               // SELECT + presigned URL se completed
initiateAccountDeletion(userId)            // soft delete + anonymize conforme LGPD art. 18
```

---

## Diagrama de Dependências entre Services

```
authController
    └─► authService
            └─► userService (findByEmail, findByCpf)
            └─► sessionService (createSession)
            └─► notificationService (sendVerificationEmail, sendResetEmail)

messageController
    └─► hostilityFilter (analyze)
    └─► messageService (create, list)
    └─► notificationService (notifyCoparent)
    └─► pdfExport (generateMessagesPdf)
    └─► storage (uploadExport)

expenseController
    └─► expenseService (create, setStatus, registerPayment)
    └─► storage (uploadReceipt)
    └─► notificationService (notifyNewExpense)

documentController
    └─► documentService (create, findById, logAccess)
    └─► storage (uploadDocument, generatePresignedUrl, deleteFile)

auditController
    └─► auditService (listByConnection, verifyChainIntegrity)
    └─► hashChain (computeHash, getLastHash)
    └─► pdfExport (generateAuditPdf)
    └─► storage (uploadExport)

lgpdController
    └─► lgpdService (compileUserData, initiateAccountDeletion)
    └─► userService (anonymize)
    └─► sessionService (revokeAllSessions)
    └─► storage (uploadExport)
```

---

## Services Internos (sem rota própria)

### `storage.js`

```js
uploadDocument(file, connectionId, docId)   // PUT no bucket guardaapp-docs
uploadAvatar(file, userId)                  // PUT no bucket guardaapp-avatars
uploadReceipt(file, expenseId)              // PUT no bucket guardaapp-receipts
uploadMilestonePhoto(file, milestoneId)     // PUT no bucket guardaapp-milestones
uploadExport(buffer, filename)              // PUT no bucket guardaapp-exports
generatePresignedUrl(key, bucket, ttlSec)  // presignedGetObject (padrão 3600s)
deleteFile(key, bucket)                     // removeObject
```

### `hostilityFilter.js`

```js
analyze(text)   // → { hostile: boolean, score: number, flags: string[] }
// Regex patterns: palavrões BR, ameaças, diminutivos agressivos
// Retorna hostile=true se score >= 0.6
// Não bloqueia — apenas adverte. Usuário pode forçar envio.
```

### `pdfExport.js`

```js
generateMessagesPdf(messages, connectionId)  // pdfkit → Buffer com assinatura digital
generateAuditPdf(events, connectionId)       // idem com hashes visíveis
generateExpensePdf(expenses, connectionId)   // relatório financeiro do período
// PDF inclui: logo GuardaApp, protocolo UUID, timestamp BRT, QR Code de verificação
```

### `hashChain.js`

```js
computeHash(eventData, previousHash)  // crypto.createHash('sha256').update(...)
getLastHash(connectionId)             // query MySQL
verifyHash(eventData, storedHash)     // recalculate + compare
```

---

## Registro de Rotas no `app.js`

```js
// src/app.js
const express = require('express');
const app = express();

app.use('/api/v1/auth',          require('./routes/auth'));
app.use('/api/v1/users',         require('./routes/users'));
app.use('/api/v1/sessions',      require('./routes/sessions'));
app.use('/api/v1/children',      require('./routes/children'));
app.use('/api/v1/coparent',      require('./routes/coparent'));
app.use('/api/v1/events',        require('./routes/events'));
app.use('/api/v1/messages',      require('./routes/messages'));
app.use('/api/v1/expenses',      require('./routes/expenses'));
app.use('/api/v1/documents',     require('./routes/documents'));
app.use('/api/v1/health',        require('./routes/health'));
app.use('/api/v1/vaccines',      require('./routes/vaccines'));
app.use('/api/v1/milestones',    require('./routes/milestones'));
app.use('/api/v1/audit',         require('./routes/audit'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/lgpd',          require('./routes/lgpd'));
```

---

## Contagem de Endpoints

| Módulo | Endpoints |
|--------|-----------|
| Auth | 8 |
| Users | 6 |
| Sessions | 3 |
| Children | 6 |
| Co-parent | 5 |
| Events | 7 |
| Messages | 5 |
| Expenses | 10 |
| Documents | 7 |
| Health | 5 |
| Vaccines | 6 |
| Milestones | 7 |
| Audit | 5 |
| Notifications | 7 |
| LGPD | 5 |
| **Total** | **97 endpoints** |
