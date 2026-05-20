const router = require('express').Router();
const ctrl   = require('../controllers/lgpdController');
const auth   = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: LGPD
 *   description: Direitos de privacidade e proteção de dados (Lei 13.709/2018)
 *
 * /lgpd/consents:
 *   get:
 *     tags: [LGPD]
 *     summary: Listar consentimentos do usuário
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de consentimentos com versão e data
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
 *                       consentType: { type: string, enum: [terms_of_use, privacy_policy, marketing_email, analytics] }
 *                       version:     { type: string }
 *                       granted:     { type: boolean }
 *                       grantedAt:   { type: string, format: date-time, nullable: true }
 *                       revokedAt:   { type: string, format: date-time, nullable: true }
 *
 * /lgpd/consents/{type}:
 *   patch:
 *     tags: [LGPD]
 *     summary: Conceder ou revogar consentimento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [terms_of_use, privacy_policy, marketing_email, analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [granted]
 *             properties:
 *               granted: { type: boolean }
 *               version: { type: string, example: "1.0" }
 *     responses:
 *       200: { description: Consentimento atualizado com timestamp e IP }
 *
 * /lgpd/data-export:
 *   post:
 *     tags: [LGPD]
 *     summary: Solicitar exportação completa dos dados pessoais (Art. 18 LGPD)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Job de exportação iniciado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId: { type: string }
 *
 * /lgpd/data-export/{jobId}:
 *   get:
 *     tags: [LGPD]
 *     summary: Verificar status da exportação de dados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status e URL de download quando concluído
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:      { type: string, enum: [pending, processing, completed, failed] }
 *                 downloadUrl: { type: string, nullable: true }
 *                 completedAt: { type: string, format: date-time, nullable: true }
 *
 * /lgpd/account:
 *   delete:
 *     tags: [LGPD]
 *     summary: Solicitar exclusão da conta (anonimização conforme LGPD)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, reason]
 *             properties:
 *               password: { type: string, description: "Confirmação de senha" }
 *               reason:   { type: string }
 *     responses:
 *       200: { description: Solicitação de exclusão recebida — prazo de 30 dias para conclusão }
 *       401: { description: Senha incorreta }
 */

router.get(   '/consents',          auth, ctrl.listConsents);
router.patch( '/consents/:type',    auth, ctrl.updateConsent);
router.post(  '/data-export',       auth, ctrl.requestDataExport);
router.get(   '/data-export/:jobId',auth, ctrl.getDataExportStatus);
router.delete('/account',           auth, ctrl.requestAccountDeletion);

module.exports = router;
