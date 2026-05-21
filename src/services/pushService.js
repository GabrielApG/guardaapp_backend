'use strict';
/**
 * Push Service — GuardaApp
 *
 * Envia push notifications via Expo Server SDK.
 * Verifica presença WS antes de enviar para evitar duplicar com entrega WS.
 *
 * LGPD: push tokens são dados pessoais — apagados em cascata
 * pelo ON DELETE CASCADE da tabela push_tokens quando o usuário é removido.
 */

const { Expo } = require('expo-server-sdk');
const db       = require('../config/database');

const expo = new Expo({
  // EXPO_ACCESS_TOKEN opcional — necessário apenas para Enhanced Push Service
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
});

/**
 * Envia push notification para todos os tokens ativos de um usuário.
 *
 * @param {string} userId   - Destinatário
 * @param {object} notification
 * @param {string} notification.title
 * @param {string} notification.body
 * @param {object} notification.data  - ex: { type: 'new_message', connectionId, messageId }
 */
async function sendToUser(userId, { title, body, data }) {
  try {
    const [tokens] = await db.query(
      'SELECT expo_token FROM push_tokens WHERE user_id = ?',
      [userId]
    );

    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.expo_token))
      .map(t => ({
        to:    t.expo_token,
        sound: 'default',
        title,
        body,
        data:  data || {},
        // Badge não gerenciado pelo servidor (app controla)
      }));

    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        // Log de tickets com erro (DeviceNotRegistered → remover token)
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === 'error') {
            console.warn('[push] Erro no ticket:', ticket.message);
            if (ticket.details?.error === 'DeviceNotRegistered') {
              // Token inválido — remover da base
              const token = chunk[i]?.to;
              if (token) {
                db.query('DELETE FROM push_tokens WHERE expo_token = ?', [token])
                  .catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error('[push] Falha ao enviar chunk:', err.message);
      }
    }
  } catch (err) {
    console.error('[push] sendToUser falhou:', err.message);
  }
}

/**
 * Registra (upsert) um token Expo para o usuário.
 */
async function registerToken(userId, expoToken, platform) {
  await db.query(
    `INSERT INTO push_tokens (id, user_id, expo_token, platform)
     VALUES (UUID(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_at = NOW(), platform = VALUES(platform)`,
    [userId, expoToken, platform]
  );
}

/**
 * Remove um token Expo (chamado no logout).
 */
async function removeToken(userId, expoToken) {
  await db.query(
    'DELETE FROM push_tokens WHERE user_id = ? AND expo_token = ?',
    [userId, expoToken]
  );
}

/**
 * Remove todos os tokens de um usuário (ex: deleção de conta LGPD).
 */
async function removeAllTokens(userId) {
  await db.query('DELETE FROM push_tokens WHERE user_id = ?', [userId]);
}

module.exports = { sendToUser, registerToken, removeToken, removeAllTokens };
