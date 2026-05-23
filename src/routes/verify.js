/**
 * Rota pública de verificação de integridade de momentos probatórios.
 * GET /verify/:protocol — sem autenticação, exposição mínima de dados.
 * Ref: SPEC_MOMENTOS_PROBATORIOS.md §6.4
 */
const router = require('express').Router();
const { verifyByProtocol } = require('../controllers/evidenceController');

router.get('/:protocol', verifyByProtocol);

module.exports = router;
