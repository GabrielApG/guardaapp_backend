const router = require('express').Router();
const authController = require('../controllers/authController');
const rateLimiter    = require('../middleware/rateLimiter');
const auth           = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticação e gerenciamento de acesso
 *
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Criar nova conta
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, cpf, password, phone]
 *             properties:
 *               name:     { type: string, example: "João Silva" }
 *               email:    { type: string, format: email, example: "joao@email.com" }
 *               cpf:      { type: string, example: "12345678909" }
 *               password: { type: string, minLength: 8, example: "Senha@2026" }
 *               phone:    { type: string, example: "+5511999999999" }
 *     responses:
 *       201: { description: Conta criada com sucesso }
 *       400: { description: Dados inválidos ou e-mail/CPF já cadastrado }
 *
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Autenticar usuário
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Tokens de acesso e refresh
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:  { type: string }
 *                 refreshToken: { type: string }
 *       401: { description: Credenciais inválidas }
 *
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renovar access token via refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Novo accessToken gerado }
 *       401: { description: Refresh token inválido ou expirado }
 *
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Encerrar sessão atual
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logout realizado }
 *       401: { description: Não autenticado }
 *
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Encerrar todas as sessões ativas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Todas as sessões encerradas }
 *
 * /auth/verify-email/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verificar e-mail pelo token
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: E-mail verificado }
 *       400: { description: Token inválido ou expirado }
 *
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Solicitar redefinição de senha (sempre retorna 200)
 *     security: []
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
 *       200: { description: Link enviado caso e-mail exista }
 *
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Redefinir senha com token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Senha redefinida }
 *       400: { description: Token inválido ou expirado }
 */

router.post('/register',        rateLimiter, authController.register);
router.post('/login',           rateLimiter, authController.login);
router.post('/refresh',         rateLimiter, authController.refreshToken);
router.post('/logout',          auth,        authController.logout);
router.post('/logout-all',      auth,        authController.logoutAll);
router.get( '/verify-email/:token',          authController.verifyEmail);
router.post('/forgot-password', rateLimiter, authController.forgotPassword);
router.post('/reset-password',  rateLimiter, authController.resetPassword);

module.exports = router;
