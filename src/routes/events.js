const router   = require('express').Router();
const ctrl     = require('../controllers/eventController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');

/**
 * @swagger
 * tags:
 *   name: Eventos
 *   description: Agenda compartilhada de eventos e compromissos
 *
 * /events:
 *   get:
 *     tags: [Eventos]
 *     summary: Listar eventos da conexão
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: childId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Lista paginada de eventos }
 *   post:
 *     tags: [Eventos]
 *     summary: Criar evento
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startDate, type]
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               startDate:   { type: string, format: date-time }
 *               endDate:     { type: string, format: date-time }
 *               type:        { type: string, enum: [custody_transfer, medical, school, activity, other] }
 *               childId:     { type: string }
 *               location:    { type: string }
 *     responses:
 *       201: { description: Evento criado }
 *
 * /events/{eventId}:
 *   get:
 *     tags: [Eventos]
 *     summary: Retornar evento por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados do evento }
 *       404: { description: Evento não encontrado }
 *   patch:
 *     tags: [Eventos]
 *     summary: Atualizar evento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
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
 *               startDate:   { type: string, format: date-time }
 *               endDate:     { type: string, format: date-time }
 *               location:    { type: string }
 *     responses:
 *       200: { description: Evento atualizado }
 *   delete:
 *     tags: [Eventos]
 *     summary: Remover evento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Evento removido }
 *
 * /events/{eventId}/confirm:
 *   post:
 *     tags: [Eventos]
 *     summary: Confirmar evento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Evento confirmado }
 *
 * /events/{eventId}/decline:
 *   post:
 *     tags: [Eventos]
 *     summary: Recusar evento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Evento recusado }
 */

router.get(   '/',                 auth, coparent, ctrl.listEvents);
router.post(  '/',                 auth, coparent, ctrl.createEvent);
router.get(   '/:eventId',         auth, coparent, ctrl.getEvent);
router.patch( '/:eventId',         auth, coparent, ctrl.updateEvent);
router.delete('/:eventId',         auth, coparent, ctrl.deleteEvent);
router.post(  '/:eventId/confirm', auth, coparent, ctrl.confirmEvent);
router.post(  '/:eventId/decline', auth, coparent, ctrl.declineEvent);

module.exports = router;
