const { verifyAccess } = require('../config/jwt');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } });
  }
  try {
    const payload = verifyAccess(header.split(' ')[1]);
    req.userId    = payload.userId;
    req.sessionId = payload.sessionId;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido ou expirado.' } });
  }
}

module.exports = auth;
