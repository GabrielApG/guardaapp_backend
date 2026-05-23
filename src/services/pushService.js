/**
 * Push Notification Service — Expo Push API
 * Usa a API HTTP da Expo sem SDK externo (apenas fetch nativo do Node 18+).
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Token management ────────────────────────────────────────────────────────

async function registerToken(userId, token, platform = 'ios') {
  const id = uuidv4();
  await db.query(
    `INSERT INTO push_tokens (id, user_id, expo_token, platform)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE platform = VALUES(platform), last_seen_at = NOW()`,
    [id, userId, token, platform]
  );
}

async function removeToken(userId, token) {
  await db.query('DELETE FROM push_tokens WHERE user_id = ? AND expo_token = ?', [userId, token]);
}

async function getTokens(userId) {
  const [rows] = await db.query('SELECT expo_token FROM push_tokens WHERE user_id = ?', [userId]);
  return rows.map(r => r.expo_token);
}

// ─── Preferences ─────────────────────────────────────────────────────────────

async function getPrefs(userId) {
  const [rows] = await db.query('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
  if (rows.length) return rows[0];
  return {
    user_id: userId,
    new_event: 1, new_expense: 1,
    event_reminder_3d: 1, event_reminder_1d: 1, event_reminder_1h: 1, event_reminder_custom: null,
    expense_pending: 1, support_payment: 1,
  };
}

async function upsertPrefs(userId, prefs) {
  const fields = [
    'new_event', 'new_expense',
    'event_reminder_3d', 'event_reminder_1d', 'event_reminder_1h', 'event_reminder_custom',
    'expense_pending', 'support_payment',
  ];
  const allowed = Object.fromEntries(fields.filter(k => k in prefs).map(k => [k, prefs[k]]));
  if (!Object.keys(allowed).length) return;

  await db.query(
    `INSERT INTO notification_preferences (user_id, ${Object.keys(allowed).join(', ')})
     VALUES (?, ${Object.keys(allowed).map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${Object.keys(allowed).map(k => `${k} = VALUES(${k})`).join(', ')}`,
    [userId, ...Object.values(allowed)]
  );
}

// ─── Core send ────────────────────────────────────────────────────────────────

async function sendToUser(userId, { title, body, data = {}, type = 'generic' }) {
  const tokens = await getTokens(userId);
  console.log(`[Push] sendToUser userId=${userId} type=${type} tokens=${tokens.length}`);
  if (!tokens.length) {
    console.log(`[Push] Nenhum token registrado para userId=${userId} — push ignorado.`);
    return;
  }

  const messages = tokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: { ...data, type },
    badge: 1,
  }));

  let status = 'sent';
  let expoIds = [];

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const json = await res.json();
    console.log(`[Push] Expo response:`, JSON.stringify(json).substring(0, 200));
    for (const ticket of (json.data ?? [])) {
      if (ticket.status === 'error') {
        console.warn(`[Push] Ticket error: ${ticket.message} (${ticket.details?.error})`);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const tokenIndex = json.data.indexOf(ticket);
          if (tokens[tokenIndex]) await removeToken(userId, tokens[tokenIndex]);
        }
      }
      if (ticket.id) expoIds.push(ticket.id);
    }
  } catch (err) {
    status = 'failed';
    console.error(`[Push] Erro ao chamar Expo API:`, err.message);
  }

  _log(userId, type, title, body, data, expoIds.join(','), status).catch(() => {});
}

async function _log(userId, type, title, body, data, expoId, status) {
  await db.query(
    'INSERT INTO notification_log (id, user_id, type, title, body, data, expo_id, status) VALUES (?,?,?,?,?,?,?,?)',
    [uuidv4(), userId, type, title, JSON.stringify(body), JSON.stringify(data), expoId || null, status]
  );
}

// ─── Domain triggers ──────────────────────────────────────────────────────────

async function notifyNewEvent(actorId, connectionId, event) {
  const coparent = await _getCoparent(actorId, connectionId);
  if (!coparent) return;

  const prefs = await getPrefs(coparent.id);
  if (!prefs.new_event) return;

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
    : '';

  await sendToUser(coparent.id, {
    title: '📅 Novo evento cadastrado',
    body: `${event.title}${dateStr ? ` · ${dateStr}` : ''}`,
    data: { eventId: event.id, connectionId },
    type: 'new_event',
  });
}

async function notifyNewExpense(actorId, connectionId, expense) {
  const coparent = await _getCoparent(actorId, connectionId);
  console.log(`[Push] notifyNewExpense actorId=${actorId} coparent=${coparent?.id ?? 'NOT FOUND'}`);
  if (!coparent) return;

  const prefs = await getPrefs(coparent.id);
  if (!prefs.new_expense) {
    console.log(`[Push] co-parente ${coparent.id} desativou new_expense — push ignorado.`);
    return;
  }

  const amount = parseFloat(expense.amount ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  await sendToUser(coparent.id, {
    title: '💸 Nova despesa cadastrada',
    body: `${expense.title} · ${amount} — aguarda sua aprovação`,
    data: { expenseId: expense.id, connectionId },
    type: 'new_expense',
  });
}

async function notifyCoparentPayment(actorId, connectionId, installmentId) {
  const coparent = await _getCoparent(actorId, connectionId);
  if (!coparent) return;

  const prefs = await getPrefs(coparent.id);
  if (!prefs.support_payment) return;

  await sendToUser(coparent.id, {
    title: '⚖️ Novo pagamento registrado',
    body: 'Um pagamento de pensão foi registrado e aguarda sua confirmação.',
    data: { installmentId, connectionId },
    type: 'support_payment',
  });
}

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

async function sendEventReminders() {
  const REMINDER_WINDOWS = [
    { type: '3d', minutes: 4320, prefKey: 'event_reminder_3d', label: '3 dias' },
    { type: '1d', minutes: 1440, prefKey: 'event_reminder_1d', label: 'amanhã' },
    { type: '1h', minutes:   60, prefKey: 'event_reminder_1h', label: '1 hora' },
  ];

  for (const win of REMINDER_WINDOWS) {
    // event_date (DATE) + start_time (TIME) — combinados em DATETIME para comparação
    const [events] = await db.query(
      `SELECT e.id, e.title, e.event_date, e.start_time, e.connection_id,
              c.user_id_a, c.user_id_b
       FROM events e
       JOIN coparent_connections c ON c.id = e.connection_id
       WHERE TIMESTAMP(e.event_date, COALESCE(e.start_time, '00:00:00'))
             BETWEEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
                 AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
         AND e.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM event_reminders_sent ers
           WHERE ers.event_id = e.id AND ers.reminder_type = ?
         )`,
      [win.minutes, win.minutes + 60, win.type]
    );

    for (const event of events) {
      for (const userId of [event.user_id_a, event.user_id_b]) {
        const prefs = await getPrefs(userId);
        if (!prefs[win.prefKey]) continue;

        const dateStr = new Date(event.event_date).toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
        });
        const timeStr = event.start_time ? ` às ${event.start_time.substring(0, 5)}` : '';

        await sendToUser(userId, {
          title: `📅 Lembrete: ${event.title}`,
          body: `Começa em ${win.label} · ${dateStr}${timeStr}`,
          data: { eventId: event.id, connectionId: event.connection_id },
          type: `event_reminder_${win.type}`,
        });
      }

      await db.query(
        'INSERT IGNORE INTO event_reminders_sent (event_id, reminder_type) VALUES (?,?)',
        [event.id, win.type]
      );
    }
  }
}

async function sendDailyPendingExpenses() {
  const [connections] = await db.query(
    `SELECT DISTINCT e.connection_id,
            c.user_id_a, c.user_id_b,
            COUNT(e.id) AS pending_count
     FROM expenses e
     JOIN coparent_connections c ON c.id = e.connection_id
     WHERE e.status = 'pendente'
       AND e.created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
       AND e.deleted_at IS NULL
     GROUP BY e.connection_id, c.user_id_a, c.user_id_b`
  );

  for (const conn of connections) {
    for (const userId of [conn.user_id_a, conn.user_id_b]) {
      const prefs = await getPrefs(userId);
      if (!prefs.expense_pending) continue;

      await sendToUser(userId, {
        title: '💸 Despesas aguardando aprovação',
        body: `${conn.pending_count} despesa${conn.pending_count > 1 ? 's' : ''} pendente${conn.pending_count > 1 ? 's' : ''} há mais de 1 dia.`,
        data: { connectionId: conn.connection_id },
        type: 'expense_pending_daily',
      });
    }
  }
}

// ─── Cron runner ──────────────────────────────────────────────────────────────

function startNotificationJobs() {
  const HOUR_MS = 60 * 60 * 1000;

  // Lembretes de eventos: a cada hora
  setInterval(async () => {
    try { await sendEventReminders(); }
    catch (err) { console.error('[push] sendEventReminders error:', err.message); }
  }, HOUR_MS);

  // Disparo imediato
  sendEventReminders().catch(err => console.error('[push] initial reminders error:', err.message));

  // Resumo diário: verifica a cada 5 min se é hora de disparar (12:00 BRT)
  setInterval(async () => {
    const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const h = nowBRT.getHours(), m = nowBRT.getMinutes();
    if (h === 12 && m < 5) {
      try { await sendDailyPendingExpenses(); }
      catch (err) { console.error('[push] daily digest error:', err.message); }
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  registerToken, removeToken, getTokens,
  getPrefs, upsertPrefs,
  sendToUser,
  notifyNewEvent, notifyNewExpense, notifyCoparentPayment,
  sendEventReminders, sendDailyPendingExpenses,
  startNotificationJobs,
};

// ─── Internal helper ──────────────────────────────────────────────────────────

async function _getCoparent(actorId, connectionId) {
  const [rows] = await db.query(
    'SELECT user_id_a, user_id_b FROM coparent_connections WHERE id = ?',
    [connectionId]
  );
  if (!rows.length) return null;
  const { user_id_a, user_id_b } = rows[0];
  const coparentId = actorId === user_id_a ? user_id_b : user_id_a;
  const [users] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [coparentId]);
  return users[0] ?? null;
}
