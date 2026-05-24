const router   = require('express').Router();
const ctrl     = require('../controllers/milestoneController');
const evCtrl   = require('../controllers/evidenceController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Marcos
 *   description: Marcos e memórias do desenvolvimento dos filhos
 *
 * /milestones:
 *   get:
 *     tags: [Marcos]
 *     summary: Listar marcos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: childId
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [first_word, first_step, school, birthday, achievement, other] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Lista paginada de marcos }
 *   post:
 *     tags: [Marcos]
 *     summary: Criar marco com foto opcional (até 20 MB)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [childId, title, date, category]
 *             properties:
 *               childId:     { type: string }
 *               title:       { type: string }
 *               description: { type: string }
 *               date:        { type: string, format: date }
 *               category:    { type: string }
 *               photo:       { type: string, format: binary }
 *     responses:
 *       201: { description: Marco criado }
 *
 * /milestones/{milestoneId}:
 *   get:
 *     tags: [Marcos]
 *     summary: Retornar marco por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados do marco com fotos e comentários }
 *       404: { description: Marco não encontrado }
 *   patch:
 *     tags: [Marcos]
 *     summary: Atualizar marco
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
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
 *               date:        { type: string, format: date }
 *     responses:
 *       200: { description: Marco atualizado }
 *   delete:
 *     tags: [Marcos]
 *     summary: Remover marco
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Marco removido }
 *
 * /milestones/{milestoneId}/photos:
 *   post:
 *     tags: [Marcos]
 *     summary: Adicionar foto ao marco
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:   { type: string, format: binary }
 *               caption: { type: string }
 *     responses:
 *       201: { description: Foto adicionada }
 *
 * /milestones/{milestoneId}/photos/{photoId}:
 *   delete:
 *     tags: [Marcos]
 *     summary: Remover foto do marco
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Foto removida }
 *
 * /milestones/{milestoneId}/comments:
 *   post:
 *     tags: [Marcos]
 *     summary: Comentar no marco
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       201: { description: Comentário adicionado }
 */

router.get(   '/',                                              auth, coparent,                         ctrl.listMilestones);
router.post(  '/',                                              auth, coparent, upload.single('photo'),  ctrl.createMilestone);

// ── Momentos Probatórios — SPEC_MOMENTOS_PROBATORIOS.md §6 ──────────────────
// IMPORTANTE: rota estática 'evidentiary' declarada antes de '/:milestoneId' para não ser interceptada
router.post(  '/evidentiary',                                   auth, coparent, upload.single('photo'),  evCtrl.createEvidentiary);
router.get(   '/:milestoneId/evidence',                         auth, coparent,                         evCtrl.getEvidence);
router.get(   '/:milestoneId/evidence/certificate.pdf',         auth, coparent,                         evCtrl.getCertificatePdf);
router.post(  '/:milestoneId/evidence/seal',                    auth, coparent,                         evCtrl.sealEvidence);

router.get(   '/:milestoneId',                                  auth, coparent,                         ctrl.getMilestone);
router.patch( '/:milestoneId',                                  auth, coparent,                         ctrl.updateMilestone);
router.delete('/:milestoneId',                                  auth, coparent,                         ctrl.deleteMilestone);
router.post(  '/:milestoneId/photos',                           auth, coparent, upload.single('photo'),  ctrl.addPhoto);
router.delete('/:milestoneId/photos/:photoId',                  auth, coparent,                         ctrl.deletePhoto);
router.post(  '/:milestoneId/comments',                         auth, coparent,                         ctrl.addComment);

module.exports = router;
