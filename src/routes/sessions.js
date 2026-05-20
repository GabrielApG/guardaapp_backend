const router = require('express').Router();
const ctrl   = require('../controllers/sessionController');
const auth   = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Sessões
 *   description: Gerenciamento de sessões ativas (dispositivos conectados)
 *
 * /sessions:
 *   get:
 *     tags: [Sessões]
 *     summary: Listar sessões ativas do usuário
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sessões com dispositivo, IP e data de criação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:           { type: string }
 *                       userAgent:    { type: string }
 *                       ipAddress:    { type: string }
 *                       createdAt:    { type: string, format: date-time }
 *                       lastUsedAt:   { type: string, format: date-time }
 *                       isCurrent:    { type: boolean }
 *   delete:
 *     tags: [Sessões]
 *     summary: Revogar todas as sessões (exceto a atual)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Todas as outras sessões revogadas }
 *
 * /sessions/{sessionId}:
 *   delete:
 *     tags: [Sessões]
 *     summary: Revogar sessão específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Sessão revogada }
 *       404: { description: Sessão não encontrada }
 */

router.get(   '/',           auth, ctrl.listSessions);
router.delete('/:sessionId', auth, ctrl.revokeSession);
router.delete('/',           auth, ctrl.revokeAllSessions);

module.exports = router;
