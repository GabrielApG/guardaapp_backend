'use strict';
const router   = require('express').Router();
const ctrl     = require('../controllers/messageController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Mensagens
 *   description: Canal de comunicação entre co-genitores com filtro de hostilidade e trilha de auditoria
 *
 * /messages:
 *   get:
 *     tags: [Mensagens]
 *     summary: Listar mensagens da conexão
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: before
 *         schema: { type: string }
 *         description: Cursor de paginação (ID da última mensagem carregada)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Lista de mensagens (ordenadas por created_at ASC)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *   post:
 *     tags: [Mensagens]
 *     summary: Enviar mensagem (passa pelo filtro de hostilidade)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:    { type: string, example: "Podemos combinar a visita para sábado?" }
 *               force:   { type: boolean, default: false, description: "Forçar envio mesmo com hostilidade" }
 *               childId: { type: string }
 *               replyTo: { type: string }
 *     responses:
 *       201: { description: Mensagem enviada com sucesso }
 *       200:
 *         description: Mensagem bloqueada pelo filtro de hostilidade (hostile=true)
 *
 * /messages/unread-count:
 *   get:
 *     tags: [Mensagens]
 *     summary: Contagem de mensagens não lidas do co-parente
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total de mensagens não lidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer }
 *
 * /messages/delivered:
 *   patch:
 *     tags: [Mensagens]
 *     summary: Marcar mensagens como entregues (fallback REST do evento WS message:delivered)
 *     description: >
 *       Marca como delivered_at=NOW() todas as mensagens enviadas pelo co-parente
 *       que ainda não foram entregues. Emite message:status (delivered) via WebSocket
 *       para atualizar o tick do remetente em tempo real.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mensagens marcadas como entregues
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: delivered }
 *                     at:     { type: string, format: date-time }
 *
 * /messages/read-all:
 *   post:
 *     tags: [Mensagens]
 *     summary: Marcar toda a conversa como lida (fallback REST do evento WS message:read)
 *     description: >
 *       Marca read_at=NOW() em todas as mensagens não lidas enviadas pelo co-parente.
 *       Garante delivered_at se ausente. Emite message:status (read) via WebSocket.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversa marcada como lida
 *
 * /messages/{messageId}:
 *   get:
 *     tags: [Mensagens]
 *     summary: Retornar mensagem por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados da mensagem }
 *
 * /messages/{messageId}/force:
 *   post:
 *     tags: [Mensagens]
 *     summary: Forçar envio de mensagem sinalizada pelo filtro de hostilidade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Mensagem enviada com aviso registrado }
 *
 * /messages/export/pdf:
 *   get:
 *     tags: [Mensagens]
 *     summary: Exportar conversa em PDF com valor probatório
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: URL de download do PDF }
 *
 * /messages/conversations/{id}/attachments:
 *   post:
 *     tags: [Mensagens]
 *     summary: Anexar documento jurídico a uma conversa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       201: { description: Anexo salvo, URL presignada retornada }
 *
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         id:              { type: string }
 *         conversation_id: { type: string }
 *         sender_id:       { type: string }
 *         text:            { type: string }
 *         hash:            { type: string, description: "SHA-256 encadeado — imutável" }
 *         is_hostile:      { type: boolean }
 *         forced_send:     { type: boolean }
 *         created_at:      { type: string, format: date-time }
 *         delivered_at:    { type: string, format: date-time, nullable: true }
 *         read_at:         { type: string, format: date-time, nullable: true }
 */

// ── Rotas com ordem correta (específicas antes de :param) ─────────────────────

// Leitura
router.get(  '/',                                     auth, coparent, ctrl.listMessages);
router.get(  '/unread-count',                         auth, coparent, ctrl.getUnreadCount);
router.get(  '/export/pdf',                           auth, coparent, ctrl.exportPdf);

// Status de entrega/leitura (fallback REST dos eventos WS)
router.patch('/delivered',                            auth, coparent, ctrl.markDelivered);
router.post( '/read-all',                             auth, coparent, ctrl.markRead);

// Envio e consulta
router.post( '/',                                     auth, coparent, ctrl.sendMessage);
router.get(  '/:messageId',                           auth, coparent, ctrl.getMessage);
router.post( '/:messageId/force',                     auth, coparent, ctrl.forceSend);

// Anexos e exportação
router.post( '/conversations/:id/attachments',        auth, coparent, upload.single('file'), ctrl.uploadAttachment);
router.post( '/conversations/:id/export',             auth, coparent, ctrl.exportConversation);

module.exports = router;
