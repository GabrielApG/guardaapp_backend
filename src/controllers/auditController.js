const auditService = require('../services/auditService');
const pdfExport    = require('../services/pdfExport');
const storage      = require('../services/storage');

async function listEvents(req, res, next) {
  try {
    const { page = 1, perPage = 20, ...filters } = req.query;
    const { events, total } = await auditService.listByConnection(req.connectionId, { ...filters, limit: +perPage });
    res.json({ success: true, data: events, meta: { page: +page, perPage: +perPage, total } });
  } catch (err) { next(err); }
}

async function getEvent(req, res, next) {
  try {
    const event = await auditService.findById(req.params.eventId, req.connectionId);
    if (!event) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evento não encontrado.' } });
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
}

async function verifyChain(req, res, next) {
  try {
    const result = await auditService.verifyChainIntegrity(req.connectionId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function requestExport(req, res, next) {
  try {
    const { startDate, endDate, types } = req.body;
    const events   = await auditService.listByConnection(req.connectionId, { startDate, endDate, types, limit: 10000 });
    const buffer   = await pdfExport.generateAuditPdf(events.events, req.connectionId);
    const protocol = `AU-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const url      = await storage.uploadExport(buffer, `${protocol}.pdf`);
    res.json({ success: true, data: { protocol, downloadUrl: url, eventCount: events.total } });
  } catch (err) { next(err); }
}

async function getExportStatus(req, res, next) {
  try {
    const job = await auditService.getExportJob(req.params.jobId, req.connectionId);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

module.exports = { listEvents, getEvent, verifyChain, requestExport, getExportStatus };
