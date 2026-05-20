const router   = require('express').Router();
const ctrl     = require('../controllers/coparentController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');

/**
 * @swagger
 * tags:
 *   name: Co-parentalidade
 *   description: Convites e conexão entre co-genitores
 *
 * /coparent/invite:
 *   post:
 *     tags: [Co-parentalidade]
 *     summary: Enviar convite para co-genitor pelo e-mail
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Convite enviado com código }
 *       400: { description: Já existe conexão ativa }
 *
 * /coparent/accept:
 *   post:
 *     tags: [Co-parentalidade]
 *     summary: Aceitar convite com código
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: "ABC123" }
 *     responses:
 *       200: { description: Conexão estabelecida }
 *       400: { description: Código inválido ou expirado }
 *
 * /coparent/connection:
 *   get:
 *     tags: [Co-parentalidade]
 *     summary: Retornar dados da conexão ativa
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Dados da conexão }
 *       404: { description: Sem conexão ativa }
 *
 * /coparent/connection/protective-order:
 *   patch:
 *     tags: [Co-parentalidade]
 *     summary: Alternar flag de medida protetiva
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Flag atualizada }
 *
 * /coparent/connection/terminate:
 *   post:
 *     tags: [Co-parentalidade]
 *     summary: Encerrar conexão de co-parentalidade
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Conexão encerrada }
 */

router.post(  '/invite',                          auth,           ctrl.sendInvite);
router.post(  '/accept',                          auth,           ctrl.acceptInvite);
router.get(   '/connection',                      auth,           ctrl.getConnection);
router.patch( '/connection/protective-order',     auth, coparent, ctrl.toggleProtectiveOrder);
router.post(  '/connection/terminate',            auth, coparent, ctrl.terminateConnection);

module.exports = router;
