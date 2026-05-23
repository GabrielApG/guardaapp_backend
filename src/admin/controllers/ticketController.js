const svc = require('../services/ticketService');

async function listTickets(req, res, next) {
  try { const r = await svc.list(req.query); res.json({ success: true, data: { tickets: r.tickets, total: r.total } }); } catch (err) { next(err); }
}
async function getTicket(req, res, next) {
  try {
    const t = await svc.findById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket não encontrado.' } });
    res.json({ success: true, data: t });
  } catch (err) { next(err); }
}
async function assignTicket(req, res, next) {
  try { await svc.assign(req.adminId, req.params.id, req.body.adminId, req.ip); res.json({ success: true, data: { assigned: true } }); } catch (err) { next(err); }
}
async function replyTicket(req, res, next) {
  try { await svc.reply(req.adminId, req.params.id, req.body.body, req.ip); res.json({ success: true, data: { replied: true } }); } catch (err) { next(err); }
}
async function updateTicket(req, res, next) {
  try { await svc.updateTicket(req.adminId, req.params.id, req.body, req.ip); res.json({ success: true, data: { updated: true } }); } catch (err) { next(err); }
}

module.exports = { listTickets, getTicket, assignTicket, replyTicket, updateTicket };
