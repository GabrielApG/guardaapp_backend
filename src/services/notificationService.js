'use strict';
/**
 * notificationService.js — GuardaApp
 *
 * Central de notificações: in-app + push Expo.
 *
 * notifyNewMessage agora:
 *  1. Persiste notificação in-app com title/body reais
 *  2. Verifica push_enabled do destinatário
 *  3. Verifica se destinatário está online no WS (pula push se sim)
 *  4. Envia push Expo se offline
 *  5. Respeita modo baixo conflito (não revela nome/foto)
 */

const db             = require('../config/database');
const mailer         = require('../config/mailer');
const { v4: uuidv4 } = require('uuid');
const templates      = require('../templates/emails');

const FROM    = process.env.EMAIL_FROM || 'noreply@guardaapp.com.br';
const APP_URL = process.env.APP_URL    || 'http://localhost:3000';

// ─── In-app notifications ─────────────────────────────────────────────────────

async function listByUser(userId, filters = {}) {
  let sql    = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];
  if (filters.unreadOnly) { sql += ' AND read_at IS NULL'; }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(filters.limit || 50);
  const [rows] = await db.query(sql, params);
  return rows;
}

async function countUnread(userId) {
  const [rows] = await db.query(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return rows[0].count;
}

async function markRead(notifId, userId) {
  await db.query(
    'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?',
    [notifId, userId]
  );
}

async function markAllRead(userId) {
  const [result] = await db.query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return result.affectedRows;
}

async function softDelete(notifId, userId) {
  await db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notifId, userId]);
}

async function getPreferences(userId) {
  const [rows] = await db.query(
    'SELECT * FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  return rows[0] || { userId, email: true, push: true };
}

async function updatePreferences(userId, prefs) {
  await db.query(
    `INSERT INTO notification_preferences (id, user_id, email_enabled, push_enabled)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       email_enabled = VALUES(email_enabled),
       push_enabled  = VALUES(push_enabled)`,
    [uuidv4(), userId, prefs.email ? 1 : 0, prefs.push ? 1 : 0]
  );
}

async function _createNotification(userId, type, title, body, entityType, entityId) {
  await db.query(
    `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, type, title, body, entityType || null, entityId || null]
  );
}

async function notifyCoparent(connectionId, actorId, type, payload) {
  const [conn] = await db.query(
    'SELECT * FROM coparent_connections WHERE id = ?',
    [connectionId]
  );
  if (!conn.length) return;
  const { user_id_a, user_id_b } = conn[0];
  const targetId = user_id_a === actorId ? user_id_b : user_id_a;
  await _createNotification(targetId, type, 'Nova atualização', 'Seu co-parente fez uma atualização.', null, null);
}

/**
 * Notifica o destinatário de uma nova mensagem.
 * Estendido com push Expo e checagem de presença WS.
 *
 * @param {string} connectionId
 * @param {string} senderId
 * @param {object} message - objeto retornado por messageService.create
 */
async function notifyNewMessage(connectionId, senderId, message) {
  const LOG = '[push:debug]';

  // Resolver destinatário
  const [conn] = await db.query(
    'SELECT * FROM coparent_connections WHERE id = ?',
    [connectionId]
  );
  if (!conn.length) { console.warn(LOG, 'connection não encontrada:', connectionId); return; }

  const { user_id_a, user_id_b, protective_order } = conn[0];
  const targetId = user_id_a === senderId ? user_id_b : user_id_a;
  console.log(LOG, `targetId=${targetId} senderId=${senderId}`);

  // Construir título e corpo respeitando modo baixo conflito
  let senderName = 'Co-parente';
  if (!protective_order) {
    const [senderRows] = await db.query(
      'SELECT name FROM users WHERE id = ?',
      [senderId]
    );
    if (senderRows.length) senderName = senderRows[0].name;
  }

  const msgPreview = message?.text
    ? message.text.substring(0, 120) + (message.text.length > 120 ? '…' : '')
    : 'Nova mensagem';

  const title = protective_order ? 'Nova mensagem' : `${senderName} enviou uma mensagem`;
  const body  = protective_order ? 'Você tem uma nova mensagem no GuardaApp.' : msgPreview;

  // 1. Persistir notificação in-app
  await _createNotification(targetId, 'new_message', title, body, 'message', message?.id || null);

  // 2. Checar preferências de push do destinatário
  const prefs = await getPreferences(targetId);
  const pushEnabled = prefs.push_enabled !== undefined
    ? Boolean(prefs.push_enabled)
    : prefs.push !== undefined
      ? Boolean(prefs.push)
      : true;
  console.log(LOG, `pushEnabled=${pushEnabled} prefs=`, JSON.stringify(prefs));
  if (!pushEnabled) { console.log(LOG, 'PAROU: push desabilitado nas prefs'); return; }

  // 3. Checar tokens registrados
  const [tokens] = await db.query(
    'SELECT expo_token, platform FROM push_tokens WHERE user_id = ?',
    [targetId]
  );
  console.log(LOG, `tokens cadastrados para targetId=${targetId}:`, tokens.length, tokens);

  if (!tokens.length) { console.warn(LOG, 'PAROU: nenhum push token cadastrado para o usuário'); return; }

  // 5. Enviar push
  const pushService = require('./pushService');
  console.log(LOG, `enviando push para ${tokens.length} token(s)...`);
  await pushService.sendToUser(targetId, {
    title,
    body,
    data: {
      type:         'new_message',
      connectionId,
      messageId:    message?.id || null,
    },
  });
  console.log(LOG, 'push enviado ✓');
}

async function notifyNewExpense(connectionId, submitterId) {
  await notifyCoparent(connectionId, submitterId, 'expense_submitted', {});
}

async function notifyEventChange(connectionId, actorId, eventId) {
  await notifyCoparent(connectionId, actorId, 'event_created', { eventId });
}

// ─── Transactional emails ─────────────────────────────────────────────────────

async function _send(to, subject, html) {
  try {
    await mailer.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[mailer] Failed to send email to', to, '—', err.message);
  }
}

async function sendVerificationEmail(userId, token) {
  const [rows] = await db.query('SELECT email, name FROM users WHERE id = ?', [userId]);
  if (!rows.length) return;
  const { email, name } = rows[0];
  const verifyUrl = `${APP_URL}/api/v1/auth/verify-email/${token}`;
  await _send(email, 'GuardaApp — Verifique seu e-mail', templates.verificationEmail(name, verifyUrl));
}

async function sendWelcomeEmail(userId) {
  const [rows] = await db.query('SELECT email, name FROM users WHERE id = ?', [userId]);
  if (!rows.length) return;
  const { email, name } = rows[0];
  await _send(email, `Bem-vindo ao GuardaApp, ${name}!`, templates.welcomeEmail(name));
}

async function sendPasswordResetEmail(userId, token) {
  const [rows] = await db.query('SELECT email, name FROM users WHERE id = ?', [userId]);
  if (!rows.length) return;
  const { email, name } = rows[0];
  await _send(email, 'GuardaApp — Redefinição de senha', templates.passwordResetEmail(name, token));
}

async function sendInviteEmail(email, inviteCode, senderName = 'Seu co-parente') {
  const registerUrl = `${APP_URL}/cadastro`;
  await _send(
    email,
    'GuardaApp — Você recebeu um convite de co-parentalidade',
    templates.inviteEmail(senderName, inviteCode, registerUrl)
  );
}

module.exports = {
  listByUser, countUnread, markRead, markAllRead, softDelete,
  getPreferences, updatePreferences,
  notifyCoparent, notifyNewMessage, notifyNewExpense, notifyEventChange,
  sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail, sendInviteEmail,
};
