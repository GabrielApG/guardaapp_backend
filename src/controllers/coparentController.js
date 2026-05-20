const coparentService     = require('../services/coparentService');
const notificationService = require('../services/notificationService');

async function sendInvite(req, res, next) {
  try {
    const { email } = req.body;
    const invite = await coparentService.createInvite(req.userId, email);
    await notificationService.sendInviteEmail(email, invite.invite_code);
    res.status(201).json({ success: true, data: { inviteCode: invite.invite_code, inviteEmail: email } });
  } catch (err) { next(err); }
}

async function acceptInvite(req, res, next) {
  try {
    const { inviteCode } = req.body;
    const connection = await coparentService.acceptByCode(req.userId, inviteCode);
    res.json({ success: true, data: { connectionId: connection.id } });
  } catch (err) { next(err); }
}

async function getConnection(req, res, next) {
  try {
    const connection = await coparentService.getConnectionForUser(req.userId);
    if (!connection) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Nenhuma conexão encontrada.' } });
    res.json({ success: true, data: connection });
  } catch (err) { next(err); }
}

async function toggleProtectiveOrder(req, res, next) {
  try {
    const { enabled } = req.body;
    await coparentService.setProtectiveOrder(req.connectionId, !!enabled);
    res.json({ success: true, data: { protectiveOrder: !!enabled } });
  } catch (err) { next(err); }
}

async function terminateConnection(req, res, next) {
  try {
    const { reason } = req.body;
    await coparentService.terminate(req.connectionId, req.userId, reason);
    res.json({ success: true, data: { message: 'Conexão encerrada.' } });
  } catch (err) { next(err); }
}

module.exports = { sendInvite, acceptInvite, getConnection, toggleProtectiveOrder, terminateConnection };
