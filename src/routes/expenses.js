const router   = require('express').Router();
const ctrl     = require('../controllers/expenseController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: Despesas
 *   description: Gestão de despesas compartilhadas dos filhos
 *
 * /expenses/summary:
 *   get:
 *     tags: [Despesas]
 *     summary: Resumo financeiro da conexão (totais por status, saldo)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Resumo com totais e saldo em BRL }
 *
 * /expenses:
 *   get:
 *     tags: [Despesas]
 *     summary: Listar despesas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, contested, paid] }
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
 *       200: { description: Lista paginada de despesas }
 *   post:
 *     tags: [Despesas]
 *     summary: Criar despesa (com comprovante opcional)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [description, amount, childId, category]
 *             properties:
 *               description:   { type: string }
 *               amount:        { type: number, example: 150.50 }
 *               childId:       { type: string }
 *               category:      { type: string, enum: [medical, education, clothing, food, leisure, other] }
 *               splitPercent:  { type: integer, example: 50, description: "Porcentagem para o outro genitor" }
 *               dueDate:       { type: string, format: date }
 *               receipt:       { type: string, format: binary }
 *     responses:
 *       201: { description: Despesa criada }
 *
 * /expenses/{expenseId}:
 *   get:
 *     tags: [Despesas]
 *     summary: Retornar despesa por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Dados da despesa }
 *       404: { description: Despesa não encontrada }
 *   patch:
 *     tags: [Despesas]
 *     summary: Atualizar despesa (somente criador, status pending)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               amount:      { type: number }
 *               dueDate:     { type: string, format: date }
 *     responses:
 *       200: { description: Despesa atualizada }
 *   delete:
 *     tags: [Despesas]
 *     summary: Remover despesa (somente criador, status pending)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Despesa removida }
 *
 * /expenses/{expenseId}/approve:
 *   post:
 *     tags: [Despesas]
 *     summary: Aprovar despesa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Despesa aprovada }
 *
 * /expenses/{expenseId}/contest:
 *   post:
 *     tags: [Despesas]
 *     summary: Contestar despesa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
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
 *       200: { description: Despesa contestada }
 *
 * /expenses/{expenseId}/pay:
 *   post:
 *     tags: [Despesas]
 *     summary: Registrar pagamento com comprovante
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipt:   { type: string, format: binary }
 *               paidAt:    { type: string, format: date-time }
 *               notes:     { type: string }
 *     responses:
 *       200: { description: Pagamento registrado }
 *
 * /expenses/receipt/{expenseId}:
 *   post:
 *     tags: [Despesas]
 *     summary: Adicionar/substituir comprovante de uma despesa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipt: { type: string, format: binary }
 *     responses:
 *       200: { description: Comprovante salvo, URL presignada retornada }
 */

router.get(  '/summary',              auth, coparent,                        ctrl.getSummary);
router.get(  '/',                     auth, coparent,                        ctrl.listExpenses);
router.post( '/',                     auth, coparent, upload.single('receipt'), ctrl.createExpense);
router.get(  '/:expenseId',           auth, coparent,                        ctrl.getExpense);
router.patch('/:expenseId',           auth, coparent,                        ctrl.updateExpense);
router.delete('/:expenseId',          auth, coparent,                        ctrl.deleteExpense);
router.post( '/:expenseId/approve',   auth, coparent,                        ctrl.approveExpense);
router.post( '/:expenseId/contest',   auth, coparent,                        ctrl.contestExpense);
router.post( '/:expenseId/pay',       auth, coparent, upload.single('receipt'), ctrl.registerPayment);
router.post( '/receipt/:expenseId',   auth, coparent, upload.single('receipt'), ctrl.uploadReceipt);

module.exports = router;
