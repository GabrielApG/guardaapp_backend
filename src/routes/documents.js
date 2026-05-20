const router   = require('express').Router();
const ctrl     = require('../controllers/documentController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Documentos
 *   description: Repositório de documentos legais e pessoais dos filhos
 *
 * /documents:
 *   get:
 *     tags: [Documentos]
 *     summary: Listar documentos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: childId
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [legal, medical, school, identity, other] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Lista paginada de documentos }
 *   post:
 *     tags: [Documentos]
 *     summary: Fazer upload de documento (até 50 MB)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, title, category]
 *             properties:
 *               file:     { type: string, format: binary }
 *               title:    { type: string }
 *               category: { type: string, enum: [legal, medical, school, identity, other] }
 *               childId:  { type: string }
 *               notes:    { type: string }
 *     responses:
 *       201: { description: Documento armazenado, URL presignada retornada }
 *
 * /documents/{docId}:
 *   get:
 *     tags: [Documentos]
 *     summary: Retornar metadados de um documento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Metadados do documento }
 *       404: { description: Documento não encontrado }
 *   patch:
 *     tags: [Documentos]
 *     summary: Atualizar metadados do documento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:    { type: string }
 *               category: { type: string }
 *               notes:    { type: string }
 *     responses:
 *       200: { description: Metadados atualizados }
 *   delete:
 *     tags: [Documentos]
 *     summary: Remover documento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Documento removido }
 *
 * /documents/{docId}/url:
 *   get:
 *     tags: [Documentos]
 *     summary: Gerar URL presignada para download (válida por 15 min)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: URL presignada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:       { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *
 * /documents/{docId}/access-log:
 *   get:
 *     tags: [Documentos]
 *     summary: Histórico de acessos ao documento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lista de acessos com timestamp e usuário }
 */

router.get(   '/',                  auth, coparent,                       ctrl.listDocuments);
router.post(  '/',                  auth, coparent, upload.single('file'), ctrl.uploadDocument);
router.get(   '/:docId',            auth, coparent,                       ctrl.getDocument);
router.get(   '/:docId/url',        auth, coparent,                       ctrl.getPresignedUrl);
router.patch( '/:docId',            auth, coparent,                       ctrl.updateDocument);
router.delete('/:docId',            auth, coparent,                       ctrl.deleteDocument);
router.get(   '/:docId/access-log', auth, coparent,                       ctrl.getAccessLog);

module.exports = router;
