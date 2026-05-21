'use strict';
/**
 * Handlers de eventos WebSocket — Mensagens
 *
 * Eventos recebidos (cliente → servidor):
 *   message:send      { text, tempId, childId?, replyTo?, force? }
 *   message:delivered { messageId? } | { all: true }
 *   message:read      { messageId? } | (sem payload = toda a conversa)
 *
 * Eventos emitidos (servidor → cliente):
 *   message:new    → room connectionId
 *   message:status → room user:<senderId>
 *   (ACK via callback do message:send)
 *
 * Rate limiting simples por socket (token bucket em memória):
 *   Máximo MSG_RATE_LIMIT mensagens por MSG_RATE_WINDOW ms.
 */

const messageService      = require('../services/messageService');
const hostilityFilter     = require('../services/hostilityFilter');
const notificationService = require('../services/notificationService');

const MSG_RATE_LIMIT  = parseInt(process.env.WS_MSG_RATE_LIMIT  || '10');
const MSG_RATE_WINDOW = parseInt(process.env.WS_MSG_RATE_WINDOW || '10000'); // 10s

// ─── Helper: emitir mensagem para a room (centralizado) ──────────────────────

function emitNewMessage(io, connectionId, message, tempId) {
  io.to(connectionId).emit('message:new', {
    ...message,
    tempId: tempId || null,
  });
}

// ─── Helper: emitir atualização de status ao remetente ──────────────────────

function emitStatus(io, senderId, status, at) {
  io.to(`user:${senderId}`).emit('message:status', {
    scope: 'all',
    status,
    at,
  });
}

// ─── Rate limiter simples ────────────────────────────────────────────────────

function makeRateLimiter() {
  let count = 0;
  let resetAt = Date.now() + MSG_RATE_WINDOW;

  return function isAllowed() {
    const now = Date.now();
    if (now > resetAt) {
      count = 0;
      resetAt = now + MSG_RATE_WINDOW;
    }
    if (count >= MSG_RATE_LIMIT) return false;
    count++;
    return true;
  };
}

// ─── Registro dos handlers ───────────────────────────────────────────────────

function registerMessageHandlers(io, socket) {
  const { userId, connectionId } = socket.data;
  const isAllowed = makeRateLimiter();

  // ── message:send ────────────────────────────────────────────────────────────
  // Payload: { text, tempId, childId?, replyTo?, force? }
  // ACK:     { ok: true, message } | { ok: false, hostile: true, suggestion, messageId }
  socket.on('message:send', async (payload, ack) => {
    const cb = typeof ack === 'function' ? ack : () => {};

    // Rate limiting
    if (!isAllowed()) {
      return cb({ ok: false, error: 'RATE_LIMIT', message: 'Muitas mensagens. Aguarde alguns segundos.' });
    }

    const { text, tempId, force = false } = payload || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return cb({ ok: false, error: 'VALIDATION_ERROR', message: 'Texto não pode ser vazio.' });
    }

    try {
      // Filtro de hostilidade (igual ao fluxo REST)
      if (!force) {
        const analysis = hostilityFilter.analyze(text.trim());
        if (analysis.hostile) {
          return cb({
            ok: false,
            hostile: true,
            suggestion: analysis.suggestion,
            // Não persiste a mensagem — replicando o comportamento REST atual
            messageId: null,
          });
        }
      }

      // Persistir mensagem (mantém hash chain)
      const message = await messageService.create(connectionId, userId, text.trim(), force);

      // Emitir para todos na room (incluindo o próprio remetente para reconciliar tempId)
      emitNewMessage(io, connectionId, message, tempId);

      // Notificar destinatário (in-app + push se offline)
      notificationService.notifyNewMessage(connectionId, userId, message).catch(err => {
        console.error('[WS] notifyNewMessage falhou:', err.message);
      });

      // ACK de sucesso
      cb({ ok: true, message });
    } catch (err) {
      console.error('[WS] message:send erro:', err.message);
      cb({ ok: false, error: 'INTERNAL_ERROR', message: 'Erro interno ao enviar mensagem.' });
    }
  });

  // ── message:delivered ────────────────────────────────────────────────────────
  // Payload: { messageId } para uma mensagem específica OU { all: true } para todas
  socket.on('message:delivered', async (payload) => {
    try {
      const at = new Date().toISOString();
      await messageService.markDelivered(connectionId, userId);

      // Descobrir senderId (o outro participante da conexão)
      const { user_id_a, user_id_b } = socket.data.connection;
      const senderId = user_id_a === userId ? user_id_b : user_id_a;

      emitStatus(io, senderId, 'delivered', at);
    } catch (err) {
      console.error('[WS] message:delivered erro:', err.message);
    }
  });

  // ── message:read ─────────────────────────────────────────────────────────────
  // Payload: {} (toda a conversa) — sem granularidade por mensagem por ora
  socket.on('message:read', async () => {
    try {
      const at = new Date().toISOString();
      await messageService.markRead(connectionId, userId);

      // Descobrir senderId
      const { user_id_a, user_id_b } = socket.data.connection;
      const senderId = user_id_a === userId ? user_id_b : user_id_a;

      emitStatus(io, senderId, 'read', at);
    } catch (err) {
      console.error('[WS] message:read erro:', err.message);
    }
  });
}

module.exports = registerMessageHandlers;
