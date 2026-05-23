const svc   = require('../services/moderationService');
const audit = require('../services/adminAuditService');

async function listFlags(req, res, next) {
  try { const r = await svc.listFlags(req.query); res.json({ success: true, data: { flags: r.flags, total: r.total } }); } catch (err) { next(err); }
}
async function getFlag(req, res, next) {
  try {
    await audit.log(req.adminId, 'moderation.view', { targetType: 'moderation_flag', targetId: req.params.id, description: 'Flag de moderação visualizada', ip: req.ip });
    const flag = await svc.findById(req.params.id);
    if (!flag) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Flag não encontrada.' } });
    res.json({ success: true, data: flag });
  } catch (err) { next(err); }
}
async function resolveFlag(req, res, next) {
  try { await svc.resolveFlag(req.adminId, req.params.id, req.body, req.ip); res.json({ success: true, data: { resolved: true } }); } catch (err) { next(err); }
}

module.exports = { listFlags, getFlag, resolveFlag };
