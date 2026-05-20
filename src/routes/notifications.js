const router = require('express').Router();
const ctrl   = require('../controllers/notificationController');
const auth   = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Notificações
 *   description: Central de notificações e preferências do usuário
 *
 * /notifications:
 *   get:
 *     tags: [Notificações]
 *     summary: Listar notificações do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
 *         schema: { type: boolean }
 *         description: Filtrar por lidas (true) ou não lidas (false)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200: { description: Lista paginada de notificações }
 *
 * /notifications/unread-count:
 *   get:
 *     tags: [Notificações]
 *     summary: Contar notificações não lidas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total de não lidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *
 * /notifications/{notifId}/read:
 *   patch:
 *     tags: [Notificações]
 *     summary: Marcar notificação como lida
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notifId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notificação marcada como lida }
 *
 * /notifications/read-all:
 *   patch:
 *     tags: [Notificações]
 *     summary: Marcar todas como lidas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Todas marcadas como lidas }
 *
 * /notifications/{notifId}:
 *   delete:
 *     tags: [Notificações]
 *     summary: Remover notificação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notifId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notificação removida }
 *
 * /notifications/preferences:
 *   get:
 *     tags: [Notificações]
 *     summary: Retornar preferências de notificação
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Preferências atuais }
 *   patch:
 *     tags: [Notificações]
 *     summary: Atualizar preferências de notificação
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNewMessage:  { type: boolean }
 *               emailNewExpense:  { type: boolean }
 *               emailEventChange: { type: boolean }
 *               pushEnabled:      { type: boolean }
 *     responses:
 *       200: { description: Preferências atualizadas }
 */

router.get(   '/',                    auth, ctrl.listNotifications);
router.get(   '/unread-count',        auth, ctrl.getUnreadCount);
router.patch( '/:notifId/read',       auth, ctrl.markRead);
router.patch( '/read-all',            auth, ctrl.markAllRead);
router.delete('/:notifId',            auth, ctrl.deleteNotification);
router.get(   '/preferences',         auth, ctrl.getPreferences);
router.patch( '/preferences',         auth, ctrl.updatePreferences);

module.exports = router;
