# GuardaApp — Spec de Backend: Pensão Alimentícia

> **Objetivo:** implementar o módulo de **pensão alimentícia** como uma obrigação financeira **recorrente, por filho**, distinta das despesas avulsas (`expenses`). O módulo cobre: cadastro do acordo de pensão (valor por filho ou consolidado, modalidade de pagamento, vencimento, reajuste), geração automática de parcelas mensais, registro de pagamento com comprovante, confirmação de recebimento pelo outro genitor, histórico, auditoria append-only e exportação de extrato em **PDF assinado com validade jurídica**.
>
> **Stack atual (preservar):** Node.js 20 LTS · Express 4 · MySQL 8 · MinIO · JWT (access + refresh) · Swagger · `mysql2` (`db.query`). Envelope de resposta `{ success, data, meta }` / `{ success, error: { code, message } }`.
> **Princípio inviolável:** todo registro financeiro é **imutável e auditável**. Pagamentos e confirmações nunca são editados nem deletados — correções viram novos eventos. A trilha de auditoria usa o `hashChain` existente (SHA-256 encadeado).

---

## 0. CONTEXTO — O QUE JÁ EXISTE (não reescrever)

- `migrations/004_create_children.sql` — `children` (`id`, `connection_id`, `name`, ...).
- `migrations/007_create_expenses.sql` — **despesas avulsas** (submit → approve/contest → pay). **NÃO confundir com pensão.** Pensão é recorrente e tem natureza jurídica própria (obrigação alimentar fixada em acordo/sentença).
- `migrations/012_create_audit.sql` — `audit_events` (append-only com `hash`/`previous_hash`).
- `src/services/auditService.js` — `log(connectionId, actorId, eventType, description, metadata)`.
- `src/services/hashChain.js` — `getLastHash(connectionId)`, `computeHash(...)`.
- `src/services/storage.js` — `generatePresignedUrl(key, bucket, ttl)` + upload em MinIO.
- `src/config/minio.js` — `BUCKETS` (usar `BUCKETS.RECEIPTS` para comprovantes de pensão).
- `src/services/pdfExport.js` — geração de PDF assinado (reaproveitar para o extrato).
- `src/services/notificationService.js` — `notify*` (in-app + push).
- `src/middleware/auth.js` (popula `req.userId`, `req.sessionId`), `src/middleware/coparent.js` (popula `req.connectionId`, `req.connection`).

**Esta entrega adiciona um módulo novo. Não altera o módulo de despesas.**

---

## 1. DOMÍNIO — DECISÕES DE MODELAGEM

Pesquisa do contexto jurídico brasileiro embasou as escolhas abaixo (modalidades de pagamento e exigência de rastro probatório):

**Modalidades de pagamento de pensão (enum `payment_mode`):**
- `desconto_em_folha` — descontado direto da folha do alimentante (mais seguro juridicamente; o app só *registra* a modalidade, o pagamento é feito pelo empregador).
- `pix` — comprovante PIX é prova legal da transação.
- `transferencia` / `deposito` — TED/DOC ou depósito em conta.
- `dinheiro` — espécie (exige recibo; modalidade de maior risco probatório — o app deve sinalizar isso).
- `in_natura` — pagamento direto de despesas (escola, plano de saúde) no lugar de valor em dinheiro.
- `misto` — combinação (ex.: parte em folha + parte in natura).

**Valor por filho ou consolidado:** o acordo (`support_agreements`) é por **conexão** e contém *itens por filho* (`support_agreement_items`). Cada item tem o valor daquele filho. Permite tanto valor individual por filho quanto valor único distribuído. O valor total mensal do acordo = soma dos itens ativos.

**Reajuste:** suportar dois modos: `percentual_salario_minimo` (valor expresso em nº de salários mínimos, recalculado quando o SM muda) e `valor_fixo` com `indice_reajuste` opcional (ex.: IPCA/INPC anual). Guardar `base_value` e `readjustment_mode`.

**Quem paga / quem recebe:** `payer_id` e `payee_id` (ambos `users.id` dentro da conexão). Tipicamente o alimentante (devedor) e o guardião (credor).

**Parcelas (`support_installments`):** geradas mensalmente a partir do acordo (job mensal + geração sob demanda). Cada parcela tem `reference_month` (YYYY-MM), `due_date`, `amount_due`, `status`.

**Status da parcela:** `pendente` → `pago` | `pago_parcial` | `atrasado` | `contestado` | `dispensado`. Status é **derivado/transicionado por eventos**, nunca editado livremente.

**Pagamento (`support_payments`):** cada pagamento registra valor, data, modalidade, comprovante (MinIO) e fica **vinculado a uma parcela**. Um pagamento pode ser confirmado ou contestado pelo recebedor. Pagamentos nunca são deletados; estorno = novo registro `reversal`.

---

## 2. MIGRATION

Criar `migrations/022_create_support.sql`:

```sql
-- ============================================================
-- 022_create_support.sql — Pensão alimentícia
-- ============================================================

-- Acordo de pensão (1 por conexão, versionável via deleted_at + novo registro)
CREATE TABLE IF NOT EXISTS support_agreements (
  id                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  connection_id       VARCHAR(36)   NOT NULL,
  payer_id            VARCHAR(36)   NOT NULL COMMENT 'Alimentante (devedor)',
  payee_id            VARCHAR(36)   NOT NULL COMMENT 'Guardião (credor)',
  payment_mode        ENUM('desconto_em_folha','pix','transferencia','deposito','dinheiro','in_natura','misto') NOT NULL,
  due_day             TINYINT       NOT NULL DEFAULT 5 COMMENT 'Dia do mês de vencimento (1-28)',
  readjustment_mode   ENUM('valor_fixo','percentual_salario_minimo') NOT NULL DEFAULT 'valor_fixo',
  readjustment_index  VARCHAR(20)   NULL COMMENT 'IPCA, INPC, etc. (informativo)',
  legal_basis         ENUM('acordo_extrajudicial','sentenca','acordo_judicial','sem_titulo') NOT NULL DEFAULT 'acordo_extrajudicial',
  legal_doc_minio_key VARCHAR(500)  NULL COMMENT 'Sentença/acordo digitalizado (cofre)',
  start_date          DATE          NOT NULL,
  end_date            DATE          NULL,
  notes               TEXT          NULL,
  status              ENUM('ativo','suspenso','encerrado') NOT NULL DEFAULT 'ativo',
  created_by_id       VARCHAR(36)   NOT NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME      NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  FOREIGN KEY (payer_id)      REFERENCES users(id),
  FOREIGN KEY (payee_id)      REFERENCES users(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  INDEX idx_conn_status (connection_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Itens do acordo: valor por filho (ou linha única consolidada)
CREATE TABLE IF NOT EXISTS support_agreement_items (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  agreement_id    VARCHAR(36)   NOT NULL,
  child_id        VARCHAR(36)   NULL COMMENT 'NULL = valor consolidado p/ todos',
  base_value      DECIMAL(10,2) NOT NULL COMMENT 'BRL ou nº de SM, conforme readjustment_mode',
  min_wage_factor DECIMAL(6,3)  NULL COMMENT 'usado quando percentual_salario_minimo',
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (agreement_id) REFERENCES support_agreements(id),
  FOREIGN KEY (child_id)     REFERENCES children(id),
  INDEX idx_agreement (agreement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Parcelas mensais geradas
CREATE TABLE IF NOT EXISTS support_installments (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  agreement_id    VARCHAR(36)   NOT NULL,
  connection_id   VARCHAR(36)   NOT NULL,
  reference_month CHAR(7)       NOT NULL COMMENT 'YYYY-MM',
  due_date        DATE          NOT NULL,
  amount_due      DECIMAL(10,2) NOT NULL,
  amount_paid     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status          ENUM('pendente','pago','pago_parcial','atrasado','contestado','dispensado') NOT NULL DEFAULT 'pendente',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agreement_month (agreement_id, reference_month),
  FOREIGN KEY (agreement_id)  REFERENCES support_agreements(id),
  FOREIGN KEY (connection_id) REFERENCES coparent_connections(id),
  INDEX idx_conn_status (connection_id, status),
  INDEX idx_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pagamentos (append-only — nunca UPDATE de valor/comprovante; estorno = novo registro)
CREATE TABLE IF NOT EXISTS support_payments (
  id                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  installment_id      VARCHAR(36)   NOT NULL,
  connection_id       VARCHAR(36)   NOT NULL,
  paid_by_id          VARCHAR(36)   NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  payment_mode        ENUM('desconto_em_folha','pix','transferencia','deposito','dinheiro','in_natura','misto') NOT NULL,
  paid_at             DATETIME      NOT NULL,
  receipt_minio_key   VARCHAR(500)  NULL,
  receipt_name        VARCHAR(255)  NULL,
  kind                ENUM('pagamento','estorno') NOT NULL DEFAULT 'pagamento',
  reverses_payment_id VARCHAR(36)   NULL,
  confirmation_status ENUM('aguardando','confirmado','contestado') NOT NULL DEFAULT 'aguardando',
  confirmed_by_id     VARCHAR(36)   NULL,
  confirmed_at        DATETIME      NULL,
  contest_reason      TEXT          NULL,
  notes               TEXT          NULL,
  hash                CHAR(64)      NOT NULL COMMENT 'SHA-256 do conteúdo do pagamento',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (installment_id)  REFERENCES support_installments(id),
  FOREIGN KEY (connection_id)   REFERENCES coparent_connections(id),
  FOREIGN KEY (paid_by_id)      REFERENCES users(id),
  INDEX idx_installment (installment_id),
  INDEX idx_conn (connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Auditoria — alinhar à convenção existente.** Em `012`, `event_type` é um **ENUM com valores curtos por categoria** (`'message','expense','event','document','decision','login','logout','health','vaccine','milestone','settings','lgpd'`). **Não** criar 9 valores longos. Em vez disso, adicionar **um único** valor de categoria `'support'` ao enum e carregar a ação específica em `metadata.action` + na `description` humana.

Criar `migrations/023_extend_audit_support.sql`:
```sql
ALTER TABLE audit_events MODIFY event_type
  ENUM('message','expense','event','document','decision','login','logout',
       'health','vaccine','milestone','settings','lgpd','support') NOT NULL;
```

Ações registradas em `metadata.action` (string): `agreement_created`, `agreement_updated`, `agreement_suspended`, `installment_generated`, `payment_registered`, `payment_confirmed`, `payment_contested`, `payment_reversed`, `extract_exported`. Exemplo de chamada:
```js
await auditService.log(connectionId, actorId, 'support',
  'Pagamento de pensão registrado (PIX) — R$ 1.200,00 — Maio/2026',
  { action: 'payment_registered', paymentId, installmentId, amount, paymentMode });
```

---

## 3. REGRAS DE NEGÓCIO

**Geração de parcelas.** Função `generateInstallments(agreementId, untilMonth)`:
- gera parcelas de `start_date` até `min(untilMonth, end_date)` que ainda não existem (idempotente — `UNIQUE (agreement_id, reference_month)`).
- `amount_due` = soma dos itens ativos. Se `readjustment_mode = percentual_salario_minimo`, multiplica `min_wage_factor` pelo SM vigente (tabela/const `MIN_WAGE_BY_YEAR` em `config`).
- `due_date` = `due_day` do mês de referência (clamp para o último dia se o mês não tiver o dia).
- registra `support_installment_generated` na auditoria.
- **Job mensal** (cron, dia 1 às 00:10 America/Sao_Paulo) gera o mês corrente de todos os acordos `ativo`. Também chamada **sob demanda** ao abrir a tela (gera os meses faltantes até o atual).

**Transição de status da parcela (derivada de pagamentos confirmados):**
- soma de `amount` dos pagamentos `confirmado` (kind=pagamento) menos estornos → `amount_paid`.
- `amount_paid >= amount_due` → `pago`; `0 < amount_paid < amount_due` → `pago_parcial`; `amount_paid = 0` e `due_date < hoje` → `atrasado`; senão `pendente`.
- pagamento `contestado` **não** conta para `amount_paid`, e a parcela vai para `contestado` até resolução.
- recalcular status sempre após registrar/confirmar/contestar/estornar pagamento.

**Registro de pagamento.** Quem registra: normalmente o `payer`. Permitir que o `payee` registre um pagamento recebido (ex.: dinheiro) — `paid_by_id` = quem registrou.
- modalidade `desconto_em_folha` pode ser registrada sem comprovante anexado (a folha é a prova), mas o app gera um **alerta jurídico** sugerindo anexar holerite.
- modalidade `dinheiro` exibe aviso de fragilidade probatória e exige `notes`.
- após registrar, status do pagamento = `aguardando`; notifica o outro genitor para confirmar.

**Confirmação / contestação.** Somente o **outro** usuário (não quem registrou) pode `confirmar` ou `contestar`. Confirmação grava `confirmed_by_id`/`confirmed_at` e recalcula a parcela. Contestação grava `contest_reason` e move a parcela para `contestado`. **Nada é deletado** — uma contestação errada é resolvida com nova confirmação (ambos os eventos ficam na trilha).

**Estorno.** `kind='estorno'` referencia `reverses_payment_id`. Usado para corrigir lançamento indevido. O pagamento original permanece; o estorno também passa por confirmação.

**Imutabilidade.** Nenhum endpoint faz UPDATE em `amount`, `paid_at`, `receipt_minio_key` de `support_payments`. Os únicos campos mutáveis são os de confirmação/contestação (que são, eles próprios, eventos auditados).

---

## 4. SERVICES

Criar `src/services/supportService.js`:

```
listAgreements(connectionId)
getAgreement(agreementId, connectionId)
createAgreement(connectionId, actorId, dto)        // cria acordo + itens, audita, gera parcelas até o mês atual
updateAgreement(agreementId, connectionId, actorId, dto) // cria nova versão (soft-delete da anterior), audita
suspendAgreement(agreementId, connectionId, actorId, reason)
generateInstallments(agreementId, untilMonth)      // idempotente
listInstallments(connectionId, filters)            // por status, child, período, paginado
getInstallment(installmentId, connectionId)         // inclui pagamentos
registerPayment(installmentId, connectionId, actorId, { amount, paymentMode, paidAt, receiptKey, receiptName, notes }) // calcula hash, audita, notifica
confirmPayment(paymentId, connectionId, actorId)    // valida que actor != paid_by, audita, recalcula parcela
contestPayment(paymentId, connectionId, actorId, reason)
reversePayment(paymentId, connectionId, actorId, reason)
getSummary(connectionId)                            // total devido, total pago, em atraso, próximos vencimentos, saldo por filho
recomputeInstallmentStatus(installmentId)           // helper interno
buildExtractData(connectionId, { agreementId, startMonth, endMonth }) // payload p/ PDF
```

Padrões a seguir (iguais ao `expenseService`): `db.query`, nunca expor `*_minio_key` ao cliente, gerar `receiptUrl` presignada via `storage.generatePresignedUrl(key, BUCKETS.RECEIPTS, 3600)` na camada controller (sanitize).

Auditoria: cada mutação chama `auditService.log(connectionId, actorId, eventType, descricaoHumana, metadata)`. O `hash` do pagamento é calculado com `hashChain.computeHash({ id, installmentId, amount, paidAt, paymentMode, paidById }, previousHash)` — encadeado por conexão, como nas mensagens.

---

## 5. CONTROLLER

Criar `src/controllers/supportController.js` seguindo o estilo de `expenseController.js`:
- `sanitizeAgreement`, `sanitizeInstallment`, `sanitizePayment` (resolvem URLs presignadas, ocultam `*_minio_key`).
- todo handler usa envelope `{ success, data, meta }` e `next(err)`.
- erros de regra → `{ success:false, error:{ code, message } }` com 400/403/404/409.
- `403` quando o ator tenta confirmar o próprio pagamento (`SELF_CONFIRMATION_FORBIDDEN`).
- `409` quando tenta registrar pagamento em parcela `dispensado`/acordo `encerrado`.

Handlers exportados:
```
listAgreements, getAgreement, createAgreement, updateAgreement, suspendAgreement,
listInstallments, getInstallment,
registerPayment, confirmPayment, contestPayment, reversePayment,
getSummary, exportExtractPdf
```

---

## 6. ROTAS

Criar `src/routes/support.js` (mesma assinatura: `auth` + `coparent`; upload de comprovante com `multer` memoryStorage, limite 10 MB), e montar em `app.js`:

```js
app.use('/api/v1/support', require('./routes/support'));
```

Endpoints (`/api/v1/support`):

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/agreements` | Lista acordos da conexão |
| POST | `/agreements` | Cria acordo (+ itens por filho) |
| GET  | `/agreements/:id` | Detalhe do acordo + itens |
| PATCH| `/agreements/:id` | Atualiza acordo (gera nova versão) |
| POST | `/agreements/:id/suspend` | Suspende/encerra acordo |
| GET  | `/installments` | Lista parcelas (filtros: `status`, `childId`, `month`, `from`, `to`, paginado) |
| GET  | `/installments/:id` | Detalhe da parcela + pagamentos |
| POST | `/installments/:id/payments` | Registra pagamento (multipart, campo `receipt`) |
| POST | `/payments/:paymentId/confirm` | Confirma pagamento (somente o outro genitor) |
| POST | `/payments/:paymentId/contest` | Contesta pagamento (`reason`) |
| POST | `/payments/:paymentId/reverse` | Estorna pagamento (`reason`) |
| GET  | `/summary` | Resumo financeiro (devido, pago, atraso, próximos vencimentos, saldo por filho) |
| GET  | `/extract.pdf` | Extrato em PDF assinado (filtros `agreementId`, `from`, `to`) |

Documentar todos no Swagger no mesmo padrão das rotas de `expenses` (tags: `Pensão`).

---

## 7. EXPORTAÇÃO PDF COM VALIDADE JURÍDICA

Reaproveitar `src/services/pdfExport.js` — adicionar `generateSupportExtractPdf(extractData, connectionId)` no mesmo molde de `generateExpensePdf`/`generateMessagesPdf` (que usam `_buildBase(title, protocol)`). O binário gerado é persistido via `storage.uploadExport(buffer, filename)` (bucket `BUCKETS.EXPORTS`, TTL 24 h) e o controller devolve a URL presignada. O **extrato de pensão** deve conter:
- Cabeçalho: identificação das partes (nome, CPF mascarado conforme LGPD — exibir só em export "para juízo" mediante flag), filhos, base legal do acordo (`legal_basis`), período.
- Tabela de parcelas: mês de referência, vencimento, valor devido, valor pago, status, data de quitação.
- Para cada pagamento: data, modalidade, valor, quem registrou, status de confirmação, quem confirmou e quando, e **hash SHA-256** do registro.
- Rodapé com: `hash` encadeado final da trilha, carimbo de data/hora (America/Sao_Paulo), e declaração de integridade ("Documento gerado pelo GuardaApp — trilha de auditoria append-only verificável").
- O PDF é **assinado** (mesma assinatura usada na exportação de conversas) para garantir não-repúdio.
- Registrar `support_extract_exported` na auditoria com o intervalo exportado.

> O comprovante anexado pelo usuário (PIX, holerite, recibo) **não** é embutido no corpo do PDF por padrão (privacidade/tamanho), mas o extrato lista, por pagamento, se há comprovante e seu hash. Oferecer modo `includeReceipts=true` que anexa as imagens dos comprovantes ao final.

---

## 8. LGPD E PRIVACIDADE

- Dados financeiros de pensão são sensíveis: o acesso é restrito aos dois genitores da conexão (via `coparent`).
- No **modo baixo conflito** (`users.low_conflict_mode`), o extrato e as telas ocultam nome/foto do outro genitor (usar rótulo neutro "o outro responsável"), preservando os valores e a trilha.
- Comprovantes ficam no MinIO com URL presignada de TTL curto (1 h), nunca URL pública.
- Eventos de pensão entram no fluxo de **data-subject request** (exportação/eliminação) já existente do `lgpdService` — incluir as novas tabelas no export do titular. **Exceção:** retenção legal — registros com valor probatório em disputa não são apagados em "direito ao esquecimento"; aplicar a mesma política de retenção legal já usada em mensagens/auditoria.

---

## 9. CHECKLIST DE ENTREGA

- [ ] `migrations/022_create_support.sql` (+ `023` se `event_type` for ENUM).
- [ ] `src/services/supportService.js` com geração idempotente de parcelas e recálculo de status.
- [ ] `src/controllers/supportController.js` com sanitize e envelope padrão.
- [ ] `src/routes/support.js` + mount em `app.js` + Swagger.
- [ ] Job mensal de geração de parcelas (cron, America/Sao_Paulo).
- [ ] Extrato PDF assinado em `pdfExport.js`.
- [ ] Auditoria em todas as mutações (hash encadeado para pagamentos).
- [ ] Inclusão das tabelas no `lgpdService` (export do titular, respeitando retenção legal).
- [ ] Testes: geração de parcelas (idempotência, reajuste por SM, clamp de due_day), transição de status, proibição de auto-confirmação, imutabilidade de pagamentos.
