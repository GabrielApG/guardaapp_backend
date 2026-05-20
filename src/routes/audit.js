const router   = require('express').Router();
const ctrl     = require('../controllers/auditController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');

/**
 * @swagger
 * tags:
 *   name: Auditoria
 *   description: Trilha de auditoria com cadeia de hashes SHA-256 para valor probatório
 *
 * /audit:
 *   get:
 *     tags: [Auditoria]
 *     summary: Listar eventos de auditoria da conexão
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200: { description: Lista paginada de eventos com hash }
 *
 * /audit/{eventId}:
 *   get:
 *     tags: [Auditoria]
 *     summary: Retornar evento de auditoria por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Evento com hash, hash anterior e payload }
 *       404: { description: Evento não encontrado }
 *
 * /audit/verify:
 *   post:
 *     tags: [Auditoria]
 *     summary: Verificar integridade da cadeia de hashes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resultado da verificação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:         { type: boolean }
 *                 totalEvents:   { type: integer }
 *                 brokenAt:      { type: string, nullable: true, description: "ID do primeiro evento corrompido" }
 *
 * /audit/export:
 *   post:
 *     tags: [Auditoria]
 *     summary: Solicitar exportação da trilha de auditoria em PDF
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate:   { type: string, format: date }
 *     responses:
 *       202: { description: Job de exportação iniciado }
 *
 * /audit/export/{jobId}:
 *   get:
 *     tags: [Auditoria]
 *     summary: Verificar status do job de exportação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status do job
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:      { type: string, enum: [pending, processing, completed, failed] }
 *                 downloadUrl: { type: string, nullable: true }
 *                 completedAt: { type: string, format: date-time, nullable: true }
 */

router.get( '/',               auth, coparent, ctrl.listEvents);
router.get( '/:eventId',       auth, coparent, ctrl.getEvent);
router.post('/verify',         auth, coparent, ctrl.verifyChain);
router.post('/export',         auth, coparent, ctrl.requestExport);
router.get( '/export/:jobId',  auth, coparent, ctrl.getExportStatus);

module.exports = router;
