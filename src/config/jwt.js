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

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
