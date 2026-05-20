const messageService      = require('../services/messageService');
const hostilityFilter     = require('../services/hostilityFilter');
const notificationService = require('../services/notificationService');
const pdfExport           = require('../services/pdfExport');
const storage             = require('../services/storage');

async function listMessages(req, res, next) {
  try {
    const { before, limit = 30 } = req.query;
    const { messages, total } = await messageService.listByConnection(req.connectionId, before, parseInt(limit));
    res.json({ success: true, data: messages, meta: { total, perPage: parseInt(limit) } });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const { text, checkHostility = true, force = false } = req.body;
    if (checkHostility && !force) {
      const analysis = await hostilityFilter.analyze(text);
      if (analysis.hostile) {
        return res.json({ success: true, data: { hostile: true, suggestion: 'Sua mensagem pode ser interpretada de forma hostil. Considere reformular.', message: null } });
      }
    }
    const message = await messageService.create(req.connectionId, req.userId, text, force);
    await notificationService.notifyNewMessage(req.connectionId, req.userId);
    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
}

async function getMessage(req, res, next) {
  try {
    const message = await messageService.findById(req.params.messageId, req.connectionId);
    if (!message) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mensagem não encontrada.' } });
    res.json({ success: true, data: message });
  } catch (err) { next(err); }
}

async function forceSend(req, res, next) {
  try {
    const message = await messageService.markForcedSend(req.params.messageId, req.connectionId);
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
    if (!req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado.' } });
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

module.exports = { listMessages, sendMessage, getMessage, forceSend, exportPdf, uploadAttachment, exportConversation };
