const authService         = require('../services/authService');
const sessionService      = require('../services/sessionService');
const notificationService = require('../services/notificationService');
const userService         = require('../services/userService');
const { validationResult } = require('express-validator');

async function register(req, res, next) {
  try {
    const { name, email, cpf, phone, password, role, consents } = req.body;
    if (!consents?.terms_of_use || !consents?.privacy_policy) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.' } });
    }
    const user = await authService.createUser({ name, email, cpf, phone, password, role, consents });
    await notificationService.sendVerificationEmail(user.id, user.email_verify_token);
    res.status(201).json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: false }, message: 'Verifique seu e-mail para ativar a conta.' } });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password, deviceName, deviceOs } = req.body;
    const { user, tokens } = await authService.validateCredentials(email, password);
    const session = await sessionService.createSession(user.id, { deviceName, deviceOs, ipAddress: req.ip }, tokens.refreshToken);
    res.json({ success: true, data: { ...tokens, expiresIn: 900, user } });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') return res.status(401).json({ success: false, error: err });
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const session = await sessionService.findByRefreshToken(refreshToken);
    if (!session) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token inválido.' } });
    const tokens = await authService.generateTokenPair(session.user_id, session.id);
    await sessionService.rotateRefreshToken(session.id, tokens.refreshToken);
    res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: 900 } });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    await sessionService.revokeSession(req.sessionId, req.userId);
    res.json({ success: true, data: { message: 'Sessão encerrada com sucesso.' } });
  } catch (err) { next(err); }
}

async function logoutAll(req, res, next) {
  try {
    await sessionService.revokeAllSessions(req.userId);
    res.json({ success: true, data: { message: 'Todas as sessões foram encerradas.' } });
  } catch (err) { next(err); }
}

async function verifyEmail(req, res, next) {
  try {
    const userId = await authService.consumeEmailToken(req.params.token);
    await userService.markEmailVerified(userId);
    notificationService.sendWelcomeEmail(userId);
    const tokens = await authService.generateTokenPair(userId);
    const user   = await userService.findById(userId);
    res.json({ success: true, data: { ...tokens, user: { id: user.id, name: user.name, emailVerified: true } } });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await userService.findByEmail(email);
    if (user) {
      const token = await authService.generateResetToken(user.id);
      await notificationService.sendPasswordResetEmail(user.id, token);
    }
    const protocol = `GA-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    res.json({ success: true, data: { message: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.', protocol } });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'As senhas não coincidem.' } });
    const userId = await authService.validateResetToken(token);
    const hash   = await authService.hashPassword(password);
    await userService.updatePassword(userId, hash);
    await sessionService.revokeAllSessions(userId);
    res.json({ success: true, data: { message: 'Senha alterada com sucesso. Todas as sessões foram encerradas.' } });
  } catch (err) { next(err); }
}

module.exports = { register, login, refreshToken, logout, logoutAll, verifyEmail, forgotPassword, resetPassword };
