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
 *   description: Canal de comunicação entre co-genitores com filtro de hostilidade
 *
 * /messages:
 *   get:
 *     tags: [Mensagens]
 *     summary: Listar mensagens da conexão
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200: { description: Lista paginada de mensagens }
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
 *             required: [content]
 *             properties:
 *               content:  { type: string, example: "Podemos combinar a visita para sábado?" }
 *               childId:  { type: string }
 *               replyTo:  { type: string, description: ID da mensagem original }
 *     responses:
 *       201: { description: Mensagem enviada }
 *       422:
 *         description: Mensagem bloqueada pelo filtro de hostilidade
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hostile:    { type: boolean }
 *                 score:      { type: number }
 *                 suggestion: { type: string }
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
 *     summary: Forçar envio de mensagem sinalizada pelo filtro
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
 *       200:
 *         description: Arquivo PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /messages/conversations/{id}/attachments:
 *   post:
 *     tags: [Mensagens]
 *     summary: Anexar arquivo a uma conversa
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
 * /messages/conversations/{id}/export:
 *   post:
 *     tags: [Mensagens]
 *     summary: Solicitar exportação de conversa específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202: { description: Job de exportação iniciado }
 */

router.get(  '/',                                     auth, coparent,                          ctrl.listMessages);
router.post( '/',                                     auth, coparent,                          ctrl.sendMessage);
router.get(  '/:messageId',                           auth, coparent,                          ctrl.getMessage);
router.post( '/:messageId/force',                     auth, coparent,                          ctrl.forceSend);
router.get(  '/export/pdf',                           auth, coparent,                          ctrl.exportPdf);
router.post( '/conversations/:id/attachments',        auth, coparent, upload.single('file'),   ctrl.uploadAttachment);
router.post( '/conversations/:id/export',             auth, coparent,                          ctrl.exportConversation);

module.exports = router;
