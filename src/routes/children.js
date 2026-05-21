const router   = require('express').Router();
const ctrl     = require('../controllers/childController');
const ptrCtrl  = require('../controllers/parentingRuleController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Filhos
 *   description: Cadastro e gestão dos filhos
 *
 * /children:
 *   get:
 *     tags: [Filhos]
 *     summary: Listar filhos da conexão
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista de filhos }
 *   post:
 *     tags: [Filhos]
 *     summary: Cadastrar novo filho
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, birthDate]
 *             properties:
 *               name:      { type: string, example: "Maria" }
 *               birthDate: { type: string, format: date, example: "2020-05-15" }
 *               gender:    { type: string, enum: [M, F, O] }
 *               bloodType: { type: string, example: "A+" }
 *               notes:     { type: string }
 *     responses:
 *       201: { description: Filho cadastrado }
 *
 * /children/{childId}:
 *   get:
 *     tags: [Filhos]
 *     summary: Retornar dados de um filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados do filho }
 *       404: { description: Filho não encontrado }
 *   patch:
 *     tags: [Filhos]
 *     summary: Atualizar dados do filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:      { type: string }
 *               birthDate: { type: string, format: date }
 *               notes:     { type: string }
 *     responses:
 *       200: { description: Filho atualizado }
 *   delete:
 *     tags: [Filhos]
 *     summary: Remover filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Filho removido }
 *
 * /children/{childId}/avatar:
 *   post:
 *     tags: [Filhos]
 *     summary: Upload de foto do filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: URL da foto atualizada }
 */

router.get(   '/',                    auth, coparent,                          ctrl.listChildren);
router.post(  '/',                    auth, coparent,                          ctrl.createChild);
router.get(   '/:childId',            auth, coparent,                          ctrl.getChild);
router.patch( '/:childId',            auth, coparent,                          ctrl.updateChild);
router.delete('/:childId',            auth, coparent,                          ctrl.deleteChild);
router.post(  '/:childId/avatar',     auth, coparent, upload.single('avatar'), ctrl.uploadAvatar);

/**
 * Regime de convivência (busca / entrega) por criança.
 *
 * /children/{childId}/parenting-rules:
 *   get:    Listar regras de convivência da criança
 *   post:   Cadastrar regra (semanal ou FDS alternado)
 * /children/{childId}/parenting-rules/{ruleId}:
 *   patch:  Alterar regra (zera a confirmação do co-pai)
 *   delete: Cancelar regra
 * /children/{childId}/parenting-rules/{ruleId}/confirm:
 *   post:   Confirmar/recusar a regra (confirmação bilateral)
 * /children/{childId}/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD:
 *   get:    Agenda derivada (blocos busca->entrega no intervalo)
 */
router.get(   '/:childId/parenting-rules',                 auth, coparent, ptrCtrl.listRules);
router.post(  '/:childId/parenting-rules',                 auth, coparent, ptrCtrl.createRule);
router.patch( '/:childId/parenting-rules/:ruleId',         auth, coparent, ptrCtrl.updateRule);
router.delete('/:childId/parenting-rules/:ruleId',         auth, coparent, ptrCtrl.deleteRule);
router.post(  '/:childId/parenting-rules/:ruleId/confirm', auth, coparent, ptrCtrl.confirmRule);
router.get(   '/:childId/schedule',                        auth, coparent, ptrCtrl.getSchedule);

module.exports = router;
