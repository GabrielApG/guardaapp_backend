const bcrypt  = require('bcryptjs');
const qrcode  = require('qrcode');
const db      = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { randomBytes } = require('crypto');
const { signAdminAccess, signAdminRefresh, verifyAdminRefresh } = require('../../config/jwt');
const adminAuditService = require('./adminAuditService');
const totp = require('../../utils/totp');

async function findByEmail(email) {
  const [rows] = await db.query('SELECT * FROM admin_users WHERE email = ? AND deleted_at IS NULL', [email]);
  return rows[0] || null;
}

async function login(email, password, totpToken, ip, userAgent) {
  const admin = await findByEmail(email);
  if (!admin || !admin.is_active) {
    throw Object.assign(new Error('Credenciais inválidas.'), { code: 'INVALID_CREDENTIALS', status: 401 });
  }
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Credenciais inválidas.'), { code: 'INVALID_CREDENTIALS', status: 401 });
  }
  if (admin.mfa_enabled) {
    if (!totpToken) throw Object.assign(new Error('Código TOTP obrigatório.'), { code: 'MFA_REQUIRED', status: 401 });
    const ok = totp.verify(admin.mfa_secret, totpToken);
    if (!ok) throw Object.assign(new Error('Código TOTP inválido.'), { code: 'MFA_INVALID', status: 401 });
  }
  const accessToken  = signAdminAccess({ adminId: admin.id, adminRole: admin.admin_role });
  const refreshToken = signAdminRefresh({ adminId: admin.id });
  const sessionId    = uuidv4();
  const expiresAt    = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.query(
    'INSERT INTO admin_sessions (id, admin_id, refresh_token, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?)',
    [sessionId, admin.id, refreshToken, ip, userAgent, expiresAt]
  );
  await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [admin.id]);
  await adminAuditService.log(admin.id, 'auth.login', { description: 'Login admin bem-sucedido', ip });
  return {
    accessToken, refreshToken,
    admin: { id: admin.id, name: admin.name, email: admin.email, adminRole: admin.admin_role, mfaEnabled: !!admin.mfa_enabled },
  };
}

async function refresh(refreshToken, ip) {
  let payload;
  try { payload = verifyAdminRefresh(refreshToken); } catch { throw Object.assign(new Error('Refresh token inválido.'), { code: 'INVALID_REFRESH', status: 401 }); }
  const [rows] = await db.query('SELECT * FROM admin_sessions WHERE refresh_token = ? AND revoked_at IS NULL AND expires_at > NOW()', [refreshToken]);
  if (!rows.length) throw Object.assign(new Error('Sessão inválida.'), { code: 'INVALID_REFRESH', status: 401 });
  const [admins] = await db.query('SELECT * FROM admin_users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [rows[0].admin_id]);
  if (!admins.length) throw Object.assign(new Error('Admin não encontrado.'), { code: 'UNAUTHORIZED', status: 401 });
  const admin = admins[0];
  return { accessToken: signAdminAccess({ adminId: admin.id, adminRole: admin.admin_role }) };
}

async function logout(refreshToken, adminId, ip) {
  await db.query('UPDATE admin_sessions SET revoked_at = NOW() WHERE refresh_token = ?', [refreshToken]);
  if (adminId) await adminAuditService.log(adminId, 'auth.logout', { description: 'Logout admin', ip });
}

async function setupMfa(adminId) {
  const secret = totp.generateSecret();
  const [rows] = await db.query('SELECT email FROM admin_users WHERE id = ?', [adminId]);
  const label  = rows[0]?.email || adminId;
  await db.query('UPDATE admin_users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?', [secret, adminId]);
  const url   = totp.otpauthUrl(secret, label);
  const qrUrl = await qrcode.toDataURL(url);
  return { secret, qrUrl, otpauthUrl: url };
}

async function verifyMfaSetup(adminId, totpToken) {
  const [rows] = await db.query('SELECT mfa_secret FROM admin_users WHERE id = ?', [adminId]);
  if (!rows.length || !rows[0].mfa_secret) throw Object.assign(new Error('MFA não configurado.'), { code: 'MFA_NOT_CONFIGURED', status: 400 });
  if (!totp.verify(rows[0].mfa_secret, totpToken)) throw Object.assign(new Error('Código TOTP inválido.'), { code: 'MFA_INVALID', status: 400 });
  await db.query('UPDATE admin_users SET mfa_enabled = 1 WHERE id = ?', [adminId]);
  await adminAuditService.log(adminId, 'auth.mfa_enabled', { description: 'MFA habilitado com sucesso' });
  return { mfaEnabled: true };
}

function randPass() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  const buf = randomBytes(16); let out = '';
  for (const b of buf) out += chars[b % chars.length];
  return out;
}

async function listAdmins() {
  const [rows] = await db.query('SELECT id, name, email, admin_role, is_active, mfa_enabled, last_login_at, created_at FROM admin_users WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return rows;
}

async function createAdmin(actorId, { name, email, adminRole }, ip) {
  if (await findByEmail(email)) throw Object.assign(new Error('Email já cadastrado.'), { code: 'DUPLICATE_EMAIL', status: 409 });
  const tempPwd = randPass();
  const hash = await bcrypt.hash(tempPwd, 12);
  const id   = uuidv4();
  await db.query('INSERT INTO admin_users (id, name, email, password_hash, admin_role, created_by_id) VALUES (?,?,?,?,?,?)', [id, name, email, hash, adminRole, actorId]);
  await adminAuditService.log(actorId, 'admins.create', { targetType: 'admin', targetId: id, description: `Admin criado: ${email} (${adminRole})`, ip });
  return { id, name, email, adminRole, tempPassword: tempPwd };
}

async function updateAdmin(actorId, targetId, changes, ip) {
  const allowed = ['admin_role', 'is_active'];
  const fields  = Object.entries(changes).filter(([k]) => allowed.includes(k));
  if (!fields.length) return;
  const sets = fields.map(([k]) => `${k} = ?`).join(', ');
  await db.query(`UPDATE admin_users SET ${sets} WHERE id = ?`, [...fields.map(([, v]) => v), targetId]);
  await adminAuditService.log(actorId, 'admins.update', { targetType: 'admin', targetId, description: 'Admin atualizado', metadata: changes, ip });
}

async function deleteAdmin(actorId, targetId, ip) {
  await db.query('UPDATE admin_users SET deleted_at = NOW() WHERE id = ?', [targetId]);
  await adminAuditService.log(actorId, 'admins.delete', { targetType: 'admin', targetId, description: 'Admin removido', ip });
}

module.exports = { login, refresh, logout, setupMfa, verifyMfaSetup, listAdmins, createAdmin, updateAdmin, deleteAdmin, findByEmail };
