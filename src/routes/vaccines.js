const router   = require('express').Router();
const ctrl     = require('../controllers/vaccineController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');

/**
 * @swagger
 * tags:
 *   name: Vacinas
 *   description: Carteira de vacinação e controle de doses
 *
 * /vaccines/{childId}:
 *   get:
 *     tags: [Vacinas]
 *     summary: Retornar carteira completa de vacinação do filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Vacinas com doses aplicadas e próximas }
 *
 * /vaccines/{childId}/doses:
 *   get:
 *     tags: [Vacinas]
 *     summary: Listar doses aplicadas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lista de doses }
 *   post:
 *     tags: [Vacinas]
 *     summary: Registrar nova dose
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vaccineId, appliedAt, doseNumber]
 *             properties:
 *               vaccineId:  { type: string }
 *               appliedAt:  { type: string, format: date-time }
 *               doseNumber: { type: integer }
 *               clinic:     { type: string }
 *               lot:        { type: string }
 *     responses:
 *       201: { description: Dose registrada }
 *
 * /vaccines/{childId}/doses/{doseId}:
 *   patch:
 *     tags: [Vacinas]
 *     summary: Atualizar dose
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: doseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appliedAt: { type: string, format: date-time }
 *               clinic:    { type: string }
 *               lot:       { type: string }
 *     responses:
 *       200: { description: Dose atualizada }
 *   delete:
 *     tags: [Vacinas]
 *     summary: Remover dose
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: doseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dose removida }
 *
 * /vaccines/{childId}/pending:
 *   get:
 *     tags: [Vacinas]
 *     summary: Listar vacinas pendentes ou atrasadas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lista de vacinas com atraso ou próximas }
 */

router.get(   '/:childId',                        auth, coparent, ctrl.getVaccineCard);
router.get(   '/:childId/doses',                  auth, coparent, ctrl.listDoses);
router.post(  '/:childId/doses',                  auth, coparent, ctrl.logDose);
router.patch( '/:childId/doses/:doseId',          auth, coparent, ctrl.updateDose);
router.delete('/:childId/doses/:doseId',          auth, coparent, ctrl.deleteDose);
router.get(   '/:childId/pending',                auth, coparent, ctrl.getPendingVaccines);

module.exports = router;
