'use strict';
const messageService      = require('../services/messageService');
const hostilityFilter     = require('../services/hostilityFilter');
const notificationService = require('../services/notificationService');
const pdfExport           = require('../services/pdfExport');
const storage             = require('../services/storage');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIO() {
  try {
    return require('../realtime/socket').getIO();
  } catch {
    return null; // Socket.IO ainda não inicializado (ex: testes)
  }
}

function emitStatus(io, senderId, status) {
  if (!io) return;
  const at = new Date().toISOString();
  io.to(`user:${senderId}`).emit('message:status', {
    scope: 'all',
    status,
    at,
  });
}

// ─── Controllers existentes (preservados) ────────────────────────────────────

async function listMessages(req, res, next) {
  try {
    const { before, limit = 100 } = req.query;
    const { messages, total } = await messageService.listByConnection(
      req.connectionId, before, parseInt(limit)
    );
    res.json({ success: true, data: messages, meta: { total, perPage: parseInt(limit) } });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const { text, checkHostility = true, force = false } = req.body;

    if (checkHostility && !force) {
      const analysis = hostilityFilter.analyze(text);
      if (analysis.hostile) {
        return res.json({
          success: true,
          data: {
            hostile:    true,
            suggestion: analysis.suggestion,
            message:    null,
          },
        });
      }
    }

    const message = await messageService.create(req.connectionId, req.userId, text, force);

    // Emitir para a room via WS (se disponível)
    const io = getIO();
    if (io) {
      io.to(req.connectionId).emit('message:new', { ...message, tempId: null });
    }

    // Notificar destinatário (in-app + push se offline)
    await notificationService.notifyNewMessage(req.connectionId, req.userId, message);

    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
}

async function getMessage(req, res, next) {
  try {
    const message = await messageService.findById(req.params.messageId, req.connectionId);
    if (!message) return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Mensagem não encontrada.' },
    });
    res.json({ success: true, data: message });
  } catch (err) { next(err); }
}

async function forceSend(req, res, next) {
  try {
    const message = await messageService.markForcedSend(req.params.messageId, req.connectionId);

    // Emitir para a room via WS (mensagem forçada agora visível)
    const io = getIO();
    if (io && message) {
      io.to(req.connectionId).emit('message:new', { ...message, tempId: null });
    }

    res.json({ success: true, data: message });
  } catch (err) { next(err); }
}

async function exportPdf(req, res, next) {
  try {
    const messages = await messageService.listAll(req.connectionId);
    const buffer   = await pdfExport.generateMessagesPdf(messages, req.connectionId);
    const protocol = `GA-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const filename = `export-messages-${protocol}.pdf`;
    const url      = await storage.uploadExport(buffer, filename);
    res.json({ success: true, data: { protocol, downloadUrl: url, messageCount: messages.length } });
  } catch (err) { next(err); }
}

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' },
    });
    const key = `attachments/${req.params.id}/${Date.now()}-${req.file.originalname}`;
    const url = await storage.uploadExport(req.file.buffer, key);
    res.status(201).json({ success: true, data: { fileName: req.file.originalname, url, sizeBytes: req.file.size } });
  } catch (err) { next(err); }
}

async function exportConversation(req, res, next) {
  try {
    const messages = await messageService.listAll(req.connectionId);
    const buffer   = await pdfExport.generateMessagesPdf(messages, req.connectionId);
    const protocol = `GA-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const url      = await storage.uploadExport(buffer, `${protocol}.pdf`);
    res.json({ success: true, data: { protocol, downloadUrl: url, messageCount: messages.length } });
  } catch (err) { next(err); }
}

// ─── Novos: status de entrega/leitura (REST fallback) ─────────────────────────

/**
 * PATCH /messages/delivered
 * Marca como entregues todas as mensagens não lidas do co-parente.
 * Fallback REST do evento WS message:delivered.
 */
async function markDelivered(req, res, next) {
  try {
    await messageService.markDelivered(req.connectionId, req.userId);

    // Emitir status ao remetente via WS
    const { user_id_a, user_id_b } = req.connection;
    const senderId = user_id_a === req.userId ? user_id_b : user_id_a;
    emitStatus(getIO(), senderId, 'delivered');

    res.json({ success: true, data: { status: 'delivered', at: new Date() } });
  } catch (err) { next(err); }
}

/**
 * PATCH /messages/read  (ou POST /messages/read-all)
 * Marca como lida toda a conversa.
 * Fallback REST do evento WS message:read.
 */
async function markRead(req, res, next) {
  try {
    await messageService.markRead(req.connectionId, req.userId);

    // Emitir status ao remetente via WS
    const { user_id_a, user_id_b } = req.connection;
    const senderId = user_id_a === req.userId ? user_id_b : user_id_a;
    emitStatus(getIO(), senderId, 'read');

    res.json({ success: true, data: { status: 'read', at: new Date() } });
  } catch (err) { next(err); }
}

/**
 * GET /messages/unread-count
 * Retorna contagem de mensagens não lidas do co-parente.
 */
async function getUnreadCount(req, res, next) {
  try {
    const count = await messageService.countUnread(req.connectionId, req.userId);
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

module.exports = {
  listMessages,
  sendMessage,
  getMessage,
  forceSend,
  exportPdf,
  uploadAttachment,
  exportConversation,
  markDelivered,
  markRead,
  getUnreadCount,
};
