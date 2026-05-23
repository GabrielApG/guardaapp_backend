const svc   = require('../services/adminConnectionService');
const audit = require('../services/adminAuditService');

async function listConnections(req, res, next) {
  try {
    const { connections, total } = await svc.list(req.query);
    res.json({ success: true, data: { connections, total } });
  } catch (err) { next(err); }
}

async function getConnection(req, res, next) {
  try {
    await audit.log(req.adminId, 'connection.view', { targetType: 'connection', targetId: req.params.id, description: 'Conexão visualizada pelo admin', ip: req.ip });
    const conn = await svc.findById(req.params.id);
    if (!conn) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conexão não encontrada.' } });
    res.json({ success: true, data: conn });
  } catch (err) { next(err); }
}

module.exports = { listConnections, getConnection };
