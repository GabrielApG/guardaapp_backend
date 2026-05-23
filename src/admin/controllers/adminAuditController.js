const auditSvc  = require('../services/adminAuditService');
const pdfExport = require('../../services/pdfExport');
const storage   = require('../../services/storage');
const { formatInTimeZone } = require('date-fns-tz');

async function listAudit(req, res, next) {
  try { const r = await auditSvc.list(req.query); res.json({ success: true, data: { events: r.events, total: r.total } }); } catch (err) { next(err); }
}
async function verifyIntegrity(req, res, next) {
  try { res.json({ success: true, data: await auditSvc.verifyChainIntegrity() }); } catch (err) { next(err); }
}
async function exportPdf(req, res, next) {
  try {
    const { events } = await auditSvc.list({ ...req.query, limit: 5000 });
    const buffer   = await pdfExport.generateAdminAuditPdf(events);
    const filename = `admin-audit-${formatInTimeZone(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmm')}.pdf`;
    const url      = await storage.uploadExport(buffer, filename);
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
}

module.exports = { listAudit, verifyIntegrity, exportPdf };
