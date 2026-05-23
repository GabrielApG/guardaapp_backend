/**
 * @swagger
 * tags:
 *   name: Pensão
 *   description: Módulo de pensão alimentícia — acordos, parcelas, pagamentos e extrato
 */
const router   = require('express').Router();
const ctrl     = require('../controllers/supportController');
const auth     = require('../middleware/auth');
const coparent = require('../middleware/coparent');
const multer   = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Acordos ──────────────────────────────────────────────────────────────────
router.get(  '/agreements',              auth, coparent, ctrl.listAgreements);
router.post( '/agreements',              auth, coparent, upload.single('legal_doc'), ctrl.createAgreement);
router.get(  '/agreements/:id',          auth, coparent, ctrl.getAgreement);
router.patch( '/agreements/:id',           auth, coparent, ctrl.updateAgreement);
router.post(  '/agreements/:id/suspend',  auth, coparent, ctrl.suspendAgreement);
router.delete('/agreements/:id',          auth, coparent, ctrl.deactivateAgreement);

// ── Parcelas ─────────────────────────────────────────────────────────────────
router.get('/installments',     auth, coparent, ctrl.listInstallments);
router.get('/installments/:id', auth, coparent, ctrl.getInstallment);

// ── Registrar pagamento (multipart)
router.post('/installments/:id/payments', auth, coparent, upload.single('receipt'), ctrl.registerPayment);

// ── Ações sobre pagamento ─────────────────────────────────────────────────────
router.post('/payments/:paymentId/confirm', auth, coparent, ctrl.confirmPayment);
router.post('/payments/:paymentId/contest', auth, coparent, ctrl.contestPayment);
router.post('/payments/:paymentId/reverse', auth, coparent, ctrl.reversePayment);

// ── Resumo e extrato ──────────────────────────────────────────────────────────
router.get('/summary',      auth, coparent, ctrl.getSummary);
router.get('/extract.pdf',  auth, coparent, ctrl.exportExtractPdf);

module.exports = router;
