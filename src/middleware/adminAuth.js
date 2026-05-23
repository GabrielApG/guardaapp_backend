const { verifyAdminAccess } = require('../config/jwt');

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token admin não fornecido.' } });
  }
  try {
    const payload = verifyAdminAccess(header.split(' ')[1]);
    if (payload.scope !== 'admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Token de usuário final não aceito na API admin.' } });
    }
    req.adminId   = payload.adminId;
    req.adminRole = payload.adminRole;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token admin inválido ou expirado.' } });
  }
}

module.exports = adminAuth;
