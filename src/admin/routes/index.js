/**
 * Router agregador do realm administrativo — /api/v1/admin
 * Todas as rotas requerem adminAuth + requirePermission (exceto /auth/login e /auth/refresh)
 */
const router  = require('express').Router();
const rateLimit = require('express-rate-limit');

const adminAuth         = require('../../middleware/adminAuth');
const requirePermission = require('../../middleware/requirePermission');

const authCtrl       = require('../controllers/adminAuthController');
const userCtrl       = require('../controllers/adminUserController');
const connCtrl       = require('../controllers/adminConnectionController');
const billingCtrl    = require('../controllers/billingController');
const ticketCtrl     = require('../controllers/ticketController');
const moderationCtrl = require('../controllers/moderationController');
const auditCtrl      = require('../controllers/adminAuditController');
const metricsCtrl    = require('../controllers/metricsController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas tentativas de login admin. Aguarde 15 minutos.' } },
});

// ── Auth (sem adminAuth nas rotas públicas) ──────────────────────────────────
router.post('/auth/login',       loginLimiter, authCtrl.login);
router.post('/auth/refresh',                   authCtrl.refresh);
router.post('/auth/logout',      adminAuth,    authCtrl.logout);
router.post('/auth/mfa/setup',   adminAuth,    authCtrl.setupMfa);
router.post('/auth/mfa/verify',  adminAuth,    authCtrl.verifyMfa);

// ── Métricas / Dashboard ─────────────────────────────────────────────────────
router.get('/metrics/overview',   adminAuth, requirePermission('metrics','read'), metricsCtrl.getOverview);
router.get('/metrics/timeseries', adminAuth, requirePermission('metrics','read'), metricsCtrl.getTimeseries);

// ── Usuários ─────────────────────────────────────────────────────────────────
router.get(    '/users',                  adminAuth, requirePermission('users','read'),    userCtrl.listUsers);
router.get(    '/users/:id',              adminAuth, requirePermission('users','read'),    userCtrl.getUser);
router.patch(  '/users/:id',              adminAuth, requirePermission('users','write'),   userCtrl.updateUser);
router.post(   '/users/:id/suspend',      adminAuth, requirePermission('users','suspend'), userCtrl.suspendUser);
router.post(   '/users/:id/reactivate',   adminAuth, requirePermission('users','suspend'), userCtrl.reactivateUser);
router.post(   '/users/:id/reset-access', adminAuth, requirePermission('users','write'),   userCtrl.resetAccess);
router.delete( '/users/:id',              adminAuth, requirePermission('users','delete'),  userCtrl.hardDeleteUser);

// ── Conexões ─────────────────────────────────────────────────────────────────
router.get('/connections',     adminAuth, requirePermission('connections','read'), connCtrl.listConnections);
router.get('/connections/:id', adminAuth, requirePermission('connections','read'), connCtrl.getConnection);

// ── Billing ───────────────────────────────────────────────────────────────────
router.get(  '/billing/plans',                    adminAuth, requirePermission('billing','read'),  billingCtrl.listPlans);
router.get(  '/billing/subscriptions',            adminAuth, requirePermission('billing','read'),  billingCtrl.listSubscriptions);
router.post( '/billing/subscriptions/:id/refund', adminAuth, requirePermission('billing','write'), billingCtrl.processRefund);
router.get(  '/billing/reports',                  adminAuth, requirePermission('billing','read'),  billingCtrl.getReports);

// ── Suporte / Tickets ─────────────────────────────────────────────────────────
router.get(   '/tickets',            adminAuth, requirePermission('tickets','read'),  ticketCtrl.listTickets);
router.get(   '/tickets/:id',        adminAuth, requirePermission('tickets','read'),  ticketCtrl.getTicket);
router.post(  '/tickets/:id/assign', adminAuth, requirePermission('tickets','write'), ticketCtrl.assignTicket);
router.post(  '/tickets/:id/reply',  adminAuth, requirePermission('tickets','write'), ticketCtrl.replyTicket);
router.patch( '/tickets/:id',        adminAuth, requirePermission('tickets','write'), ticketCtrl.updateTicket);

// ── Moderação ─────────────────────────────────────────────────────────────────
router.get(  '/moderation/flags',              adminAuth, requirePermission('moderation','read'),  moderationCtrl.listFlags);
router.get(  '/moderation/flags/:id',          adminAuth, requirePermission('moderation','read'),  moderationCtrl.getFlag);
router.post( '/moderation/flags/:id/resolve',  adminAuth, requirePermission('moderation','write'), moderationCtrl.resolveFlag);

// ── LGPD / DPO ────────────────────────────────────────────────────────────────
router.get(  '/lgpd/requests',             adminAuth, requirePermission('lgpd.requests','read'),  (req, res) => res.json({ success: true, data: [], meta: { total: 0 } }));
router.post( '/lgpd/requests/:id/process', adminAuth, requirePermission('lgpd.requests','write'), (req, res) => res.json({ success: true, data: { processed: true } }));
router.get(  '/lgpd/retention',            adminAuth, requirePermission('lgpd.requests','read'),  (req, res) => res.json({ success: true, data: { policies: [] } }));

// ── Auditoria ─────────────────────────────────────────────────────────────────
router.get( '/audit',            adminAuth, requirePermission('audit','read'),   auditCtrl.listAudit);
router.get( '/audit/verify',     adminAuth, requirePermission('audit','read'),   auditCtrl.verifyIntegrity);
router.get( '/audit/export.pdf', adminAuth, requirePermission('audit','export'), auditCtrl.exportPdf);

// ── Gestão de admins (somente superadmin) ────────────────────────────────────
router.get(    '/admins',     adminAuth, requirePermission('admins','manage'), authCtrl.listAdmins);
router.post(   '/admins',     adminAuth, requirePermission('admins','manage'), authCtrl.createAdmin);
router.patch(  '/admins/:id', adminAuth, requirePermission('admins','manage'), authCtrl.updateAdmin);
router.delete( '/admins/:id', adminAuth, requirePermission('admins','manage'), authCtrl.deleteAdmin);

module.exports = router;
