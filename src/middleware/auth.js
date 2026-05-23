const { verifyAccess } = require('../config/jwt');

function auth(req, res, next) {
  // Fonte 1: Authorization header (chamadas de API normais)
  // Fonte 2: ?token= query param (fallback para downloads abertos no browser/viewer,
  //          ex.: certificate.pdf via Linking.openURL — o browser não envia headers)
  const header = req.headers.authorization;
  const raw =
    header && header.startsWith('Bearer ')
      ? header.split(' ')[1]
      : (req.query.token || null);

  if (!raw) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token não fornecido.' } });
  }
  try {
    const payload = verifyAccess(raw);
    req.userId    = payload.userId;
    req.sessionId = payload.sessionId;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido ou expirado.' } });
  }
}

module.exports = auth;
