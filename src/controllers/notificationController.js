const notificationService = require('../services/notificationService');

function sanitizeNotification(n) {
  return {
    id:        n.id,
    type:      n.type,
    title:     n.title,
    body:      n.body,
    payload:   n.entity_type ? { entityType: n.entity_type, entityId: n.entity_id } : null,
    readAt:    n.read_at ?? null,
    createdAt: n.created_at,
  };
}

async function listNotifications(req, res, next) {
  try {
    const { page = 1, perPage = 20, unreadOnly } = req.query;
    const notifications = await notificationService.listByUser(req.userId, { unreadOnly: unreadOnly === 'true', limit: +perPage });
    const unreadCount   = await notificationService.countUnread(req.userId);
    res.json({ success: true, data: notifications.map(sanitizeNotification), meta: { unreadCount } });
  } catch (err) { next(err); }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.countUnread(req.userId);
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    await notificationService.markRead(req.params.notifId, req.userId);
    res.json({ success: true, data: { readAt: new Date() } });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    const updated = await notificationService.markAllRead(req.userId);
    res.json({ success: true, data: { updated } });
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    await notificationService.softDelete(req.params.notifId, req.userId);
    res.json({ success: true, data: { message: 'Notificação removida.' } });
  } catch (err) { next(err); }
}

async function getPreferences(req, res, next) {
  try {
    const prefs = await notificationService.getPreferences(req.userId);
    res.json({ success: true, data: prefs });
  } catch (err) { next(err); }
}

async function updatePreferences(req, res, next) {
  try {
    await notificationService.updatePreferences(req.userId, req.body);
    const prefs = await notificationService.getPreferences(req.userId);
    res.json({ success: true, data: prefs });
  } catch (err) { next(err); }
}

module.exports = { listNotifications, getUnreadCount, markRead, markAllRead, deleteNotification, getPreferences, updatePreferences };
