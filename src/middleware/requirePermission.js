const { hasPermission } = require('../config/adminPermissions');

function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!hasPermission(req.adminRole, resource, action)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: `Permissão insuficiente: ${resource}.${action}` } });
    }
    next();
  };
}

module.exports = requirePermission;
