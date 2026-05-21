'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/notificationController');
const auth   = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Notificações
 *   description: Central de notificações in-app, preferências e push tokens
 *
 * /notifications:
 *   get:
 *     tags: [Notificações]
 *     summary: Listar notificações do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *       - in: query
 *         name: perPage
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Lista de notificações com contagem de não lidas }
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     count: { type: integer }
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
 * /notifications/push-token:
 *   post:
 *     tags: [Notificações]
 *     summary: Registrar token Expo para push notifications
 *     description: >
 *       Upsert do token Expo do dispositivo do usuário.
 *       Chamado após login ou quando o app obtém/renova o token.
 *       Push tokens são dados pessoais (LGPD) — apagados com o usuário.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expoToken, platform]
 *             properties:
 *               expoToken:
 *                 type: string
 *                 example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
 *               platform:
 *                 type: string
 *                 enum: [ios, android]
 *     responses:
 *       200:
 *         description: Token registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     registered: { type: boolean }
 *       400: { description: expoToken ou platform inválido }
 *   delete:
 *     tags: [Notificações]
 *     summary: Remover token Expo no logout
 *     description: >
 *       Remove o token do dispositivo da base. Chamar antes de invalidar
 *       a sessão JWT para garantir que push notifications cessem imediatamente.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expoToken]
 *             properties:
 *               expoToken:
 *                 type: string
 *                 example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
 *     responses:
 *       200:
 *         description: Token removido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     removed: { type: boolean }
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
 *               email: { type: boolean }
 *               push:  { type: boolean }
 *     responses:
 *       200: { description: Preferências atualizadas }
 */

// ── Específicas antes de :param ───────────────────────────────────────────────

router.get(   '/',                  auth, ctrl.listNotifications);
router.get(   '/unread-count',      auth, ctrl.getUnreadCount);
router.patch( '/read-all',          auth, ctrl.markAllRead);

// Push tokens
router.post(  '/push-token',        auth, ctrl.registerPushToken);
router.delete('/push-token',        auth, ctrl.removePushToken);

// Preferences
router.get(   '/preferences',       auth, ctrl.getPreferences);
router.patch( '/preferences',       auth, ctrl.updatePreferences);

// Por ID (deve ficar depois dos paths estáticos)
router.patch( '/:notifId/read',     auth, ctrl.markRead);
router.delete('/:notifId',          auth, ctrl.deleteNotification);

module.exports = router;
