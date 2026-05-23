/**
 * Routes /api/v1/notifications
 */
const express = require('express');
const auth = require('../middleware/auth');
const pushService = require('../services/pushService');
const db = require('../config/database');

const router = express.Router();
router.use(auth);

router.post('/token', async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token obrigatório' });
    await pushService.registerToken(req.userId, token, platform);
    console.log(`[Push] Token registrado — userId=${req.userId} platform=${platform} token=${token.substring(0, 30)}...`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Diagnóstico: lista tokens registrados do usuário autenticado
router.get('/token', async (req, res, next) => {
  try {
    const tokens = await pushService.getTokens(req.userId);
    res.json({ userId: req.userId, count: tokens.length, tokens });
  } catch (err) { next(err); }
});

router.delete('/token', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token obrigatório' });
    await pushService.removeToken(req.userId, token);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/preferences', async (req, res, next) => {
  try {
    const prefs = await pushService.getPrefs(req.userId);
    res.json({ preferences: prefs });
  } catch (err) { next(err); }
});

router.put('/preferences', async (req, res, next) => {
  try {
    await pushService.upsertPrefs(req.userId, req.body);
    const prefs = await pushService.getPrefs(req.userId);
    res.json({ preferences: prefs });
  } catch (err) { next(err); }
});

// Contagem de não-lidas (read_at IS NULL)
router.get('/unread-count', async (req, res, next) => {
  try {
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS count FROM notification_log WHERE user_id = ? AND read_at IS NULL',
      [req.userId]
    );
    res.json({ count: row.count });
  } catch (err) { next(err); }
});

// Marcar uma notificação como lida
router.patch('/:id/read', async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notification_log SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Marcar todas como lidas
router.patch('/read-all', async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notification_log SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    // Filtragem opcional por lidas/não-lidas
    const readFilter = req.query.read === 'false'
      ? 'AND read_at IS NULL'
      : req.query.read === 'true'
      ? 'AND read_at IS NOT NULL'
      : '';
    const [rows] = await db.query(
      `SELECT id, type, title, body, status, read_at, created_at
       FROM notification_log
       WHERE user_id = ? ${readFilter}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.userId, limit, offset]
    );
    res.json({ notifications: rows });
  } catch (err) { next(err); }
});

// Excluir uma notificação
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query(
      'DELETE FROM notification_log WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
