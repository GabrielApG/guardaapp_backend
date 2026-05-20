const bcrypt         = require('bcryptjs');
const crypto         = require('crypto');
const db             = require('../config/database');
const { signAccess, signRefresh } = require('../config/jwt');
const userService    = require('./userService');
const { v4: uuidv4 } = require('uuid');

async function createUser({ name, email, cpf, phone, password, role, consents }) {
  const existing = await userService.findByEmail(email);
  if (existing) {
    const err = new Error('E-mail já cadastrado.'); err.status = 409; err.code = 'CONFLICT'; throw err;
  }
  const existingCpf = await userService.findByCpf(cpf);
  if (existingCpf) {
    const err = new Error('CPF já cadastrado.'); err.status = 409; err.code = 'CONFLICT'; throw err;
  }
  const passwordHash   = await hashPassword(password);
  const emailToken     = generateEmailToken();
  const id             = uuidv4();
  await db.query(
    `INSERT INTO users (id, name, email, cpf, phone, password_hash, role, email_verify_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, email, cpf, phone || null, passwordHash, role || 'pai', emailToken]
  );
  if (consents) {
    for (const [type, granted] of Object.entries(consents)) {
      await db.query(
        `INSERT INTO user_consents (id, user_id, consent_type, version, granted, granted_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, type, '1.2', granted ? 1 : 0, granted ? new Date() : null]
      );
    }
  }
  return { id, name, email, role: role || 'pai', email_verify_token: emailToken };
}

async function validateCredentials(email, password) {
  const user = await userService.findByEmail(email);
  if (!user) {
    const err = new Error('Credenciais inválidas.'); err.status = 401; err.code = 'INVALID_CREDENTIALS'; throw err;
  }
  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    const err = new Error('Credenciais inválidas.'); err.status = 401; err.code = 'INVALID_CREDENTIALS'; throw err;
  }
  const tokens = await generateTokenPair(user.id);
  return {
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      custodyType: user.custody_type, avatarUrl: user.avatar_url,
      emailVerified: !!user.email_verified_at, lowConflictMode: !!user.low_conflict_mode,
    },
    tokens,
  };
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function generateTokenPair(userId, sessionId) {
  const accessToken  = signAccess({ userId, sessionId: sessionId || null });
  const refreshToken = signRefresh({ userId });
  return { accessToken, refreshToken };
}

function generateEmailToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function consumeEmailToken(token) {
  const [rows] = await db.query('SELECT id FROM users WHERE email_verify_token = ? AND deleted_at IS NULL', [token]);
  if (!rows.length) {
    const err = new Error('Token inválido.'); err.status = 400; err.code = 'VALIDATION_ERROR'; throw err;
  }
  await db.query('UPDATE users SET email_verify_token = NULL WHERE id = ?', [rows[0].id]);
  return rows[0].id;
}

async function generateResetToken(userId) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db.query('UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?', [token, expires, userId]);
  return token;
}

async function validateResetToken(token) {
  const [rows] = await db.query('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires_at > NOW() AND deleted_at IS NULL', [token]);
  if (!rows.length) {
    const err = new Error('Token inválido ou expirado.'); err.status = 400; err.code = 'VALIDATION_ERROR'; throw err;
  }
  await db.query('UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?', [rows[0].id]);
  return rows[0].id;
}

module.exports = { createUser, validateCredentials, hashPassword, comparePassword, generateTokenPair, generateEmailToken, consumeEmailToken, generateResetToken, validateResetToken };
