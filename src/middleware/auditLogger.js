const auditService = require('../services/auditService');

function auditLogger(eventType, descriptionFn) {
  return async (req, res, next) => {
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await auditService.log(
            req.connectionId || null,
            req.userId,
            eventType,
            typeof descriptionFn === 'function' ? descriptionFn(req, res) : descriptionFn,
            req.auditMeta || {}
          );
        } catch {
          // auditoria nunca deve derrubar a resposta
        }
      }
    });
    next();
  };
}

module.exports = auditLogger;
