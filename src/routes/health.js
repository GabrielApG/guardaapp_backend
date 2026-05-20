const router   = require('express').Router();
const ctrl     = require('../controllers/healthController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');

/**
 * @swagger
 * tags:
 *   name: Saúde
 *   description: Registros de saúde e carteira de vacinas
 *
 * /health/entries:
 *   get:
 *     tags: [Saúde]
 *     summary: Listar registros de saúde
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: childId
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [consultation, exam, medication, emergency, other] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Lista paginada de registros }
 *   post:
 *     tags: [Saúde]
 *     summary: Criar registro de saúde
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [childId, type, date, title]
 *             properties:
 *               childId:     { type: string }
 *               type:        { type: string, enum: [consultation, exam, medication, emergency, other] }
 *               date:        { type: string, format: date-time }
 *               title:       { type: string }
 *               description: { type: string }
 *               doctor:      { type: string }
 *               clinic:      { type: string }
 *               nextDate:    { type: string, format: date }
 *     responses:
 *       201: { description: Registro criado }
 *
 * /health/entries/{entryId}:
 *   get:
 *     tags: [Saúde]
 *     summary: Retornar registro por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados do registro }
 *       404: { description: Registro não encontrado }
 *   patch:
 *     tags: [Saúde]
 *     summary: Atualizar registro
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               nextDate:    { type: string, format: date }
 *     responses:
 *       200: { description: Registro atualizado }
 *   delete:
 *     tags: [Saúde]
 *     summary: Remover registro
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Registro removido }
 *
 * /health/vaccines/{childId}:
 *   get:
 *     tags: [Saúde]
 *     summary: Retornar carteira de vacinação do filho
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Carteira de vacinação com doses aplicadas e pendentes }
 *
 * /health/vaccines/{vaccineId}/doses:
 *   post:
 *     tags: [Saúde]
 *     summary: Registrar dose de vacina aplicada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vaccineId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appliedAt, doseNumber]
 *             properties:
 *               appliedAt:  { type: string, format: date-time }
 *               doseNumber: { type: integer }
 *               clinic:     { type: string }
 *               lot:        { type: string, description: "Lote da vacina" }
 *     responses:
 *       201: { description: Dose registrada }
 */

router.get(   '/entries',                   auth, coparent, ctrl.listEntries);
router.post(  '/entries',                   auth, coparent, ctrl.createEntry);
router.get(   '/entries/:entryId',          auth, coparent, ctrl.getEntry);
router.patch( '/entries/:entryId',          auth, coparent, ctrl.updateEntry);
router.delete('/entries/:entryId',          auth, coparent, ctrl.deleteEntry);

router.get(  '/vaccines/:childId',          auth, coparent, ctrl.getVaccineCard);
router.post( '/vaccines/:vaccineId/doses',  auth, coparent, ctrl.logDose);

module.exports = router;
