const sessionService = require('../services/sessionService');

async function listSessions(req, res, next) {
  try {
    const sessions = await sessionService.listActiveByUser(req.userId);
    const data = sessions.map(s => ({
      id:          s.id,
      userAgent:   s.user_agent ?? s.device_name ?? null,
      ipAddress:   s.ip_address ?? s.location ?? null,
      createdAt:   s.created_at,
      lastUsedAt:  s.last_seen_at ?? s.last_used_at ?? s.updated_at,
      isCurrent:   s.id === req.sessionId,
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function revokeSession(req, res, next) {
  try {
    await sessionService.revokeById(req.params.sessionId, req.userId);
    res.json({ success: true, data: { message: 'Sessão encerrada.' } });
  } catch (err) { next(err); }
}

async function revokeAllSessions(req, res, next) {
  try {
    await sessionService.revokeAllSessions(req.userId, req.sessionId);
    res.json({ success: true, data: { message: 'Todas as outras sessões foram encerradas.' } });
  } catch (err) { next(err); }
}

module.exports = { listSessions, revokeSession, revokeAllSessions };
