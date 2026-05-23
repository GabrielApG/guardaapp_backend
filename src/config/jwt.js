const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_SECRET          || 'access_secret_dev';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || 'refresh_secret_dev';
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN      || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });
}

function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

// Admin tokens — secret distinto do realm de usuários finais
const ADMIN_ACCESS_SECRET  = process.env.ADMIN_JWT_SECRET         || 'admin_access_secret_dev';
const ADMIN_REFRESH_SECRET = process.env.ADMIN_JWT_REFRESH_SECRET || 'admin_refresh_secret_dev';
const ADMIN_ACCESS_EXP     = '15m';
const ADMIN_REFRESH_EXP    = '7d';

function signAdminAccess(payload) {
  return jwt.sign({ ...payload, scope: 'admin' }, ADMIN_ACCESS_SECRET, { expiresIn: ADMIN_ACCESS_EXP });
}

function signAdminRefresh(payload) {
  return jwt.sign({ ...payload, scope: 'admin' }, ADMIN_REFRESH_SECRET, { expiresIn: ADMIN_REFRESH_EXP });
}

function verifyAdminAccess(token) {
  return jwt.verify(token, ADMIN_ACCESS_SECRET);
}

function verifyAdminRefresh(token) {
  return jwt.verify(token, ADMIN_REFRESH_SECRET);
}

module.exports = {
  signAccess, signRefresh, verifyAccess, verifyRefresh,
  signAdminAccess, signAdminRefresh, verifyAdminAccess, verifyAdminRefresh,
};
