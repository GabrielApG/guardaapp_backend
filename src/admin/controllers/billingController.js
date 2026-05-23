const svc = require('../services/billingService');

async function listPlans(req, res, next) {
  try { res.json({ success: true, data: await svc.listPlans() }); } catch (err) { next(err); }
}
async function listSubscriptions(req, res, next) {
  try { const r = await svc.listSubscriptions(req.query); res.json({ success: true, data: { subscriptions: r.subscriptions, total: r.total } }); } catch (err) { next(err); }
}
async function processRefund(req, res, next) {
  try { res.json({ success: true, data: await svc.processRefund(req.adminId, req.params.id, req.body, req.ip) }); } catch (err) { next(err); }
}
async function getReports(req, res, next) {
  try { res.json({ success: true, data: await svc.getReports(req.query) }); } catch (err) { next(err); }
}

module.exports = { listPlans, listSubscriptions, processRefund, getReports };
