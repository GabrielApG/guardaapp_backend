const coparentService = require('../services/coparentService');

async function coparent(req, res, next) {
  try {
    const connection = await coparentService.getConnectionForUser(req.userId);
    if (!connection) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Nenhuma conexão ativa de co-parentalidade encontrada.' } });
    }
    req.connectionId = connection.id;
    req.connection   = connection;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = coparent;
