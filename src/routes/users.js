const router     = require('express').Router();
const ctrl       = require('../controllers/userController');
const auth       = require('../middleware/auth');
const coparent   = require('../middleware/coparent');
const multer     = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Perfil e dados do usuário autenticado
 *
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Retornar perfil do usuário autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Dados do perfil }
 *       401: { description: Não autenticado }
 *   patch:
 *     tags: [Users]
 *     summary: Atualizar dados do perfil
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:  { type: string }
 *               phone: { type: string }
 *     responses:
 *       200: { description: Perfil atualizado }
 *
 * /users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Fazer upload de avatar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: URL do avatar atualizada }
 *   delete:
 *     tags: [Users]
 *     summary: Remover avatar
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Avatar removido }
 *
 * /users/me/low-conflict:
 *   patch:
 *     tags: [Users]
 *     summary: Alternar modo baixo conflito
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Modo atualizado }
 *
 * /users/me/coparent:
 *   get:
 *     tags: [Users]
 *     summary: Retornar dados do co-genitor conectado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Dados do co-genitor }
 *       404: { description: Sem conexão ativa }
 */

router.get(   '/me',              auth,                           ctrl.getMe);
router.patch( '/me',              auth,                           ctrl.updateMe);
router.post(  '/me/avatar',       auth, upload.single('avatar'),  ctrl.uploadAvatar);
router.delete('/me/avatar',       auth,                           ctrl.deleteAvatar);
router.patch( '/me/low-conflict', auth,                           ctrl.toggleLowConflict);
router.get(   '/me/coparent',     auth, coparent,                 ctrl.getCoparent);

module.exports = router;
