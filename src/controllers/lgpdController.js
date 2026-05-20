const lgpdService    = require('../services/lgpdService');
const sessionService = require('../services/sessionService');
const authService    = require('../services/authService');
const userService    = require('../services/userService');

async function listConsents(req, res, next) {
  try {
    const consents = await lgpdService.listConsents(req.userId);
    res.json({ success: true, data: consents });
  } catch (err) { next(err); }
}

async function updateConsent(req, res, next) {
  try {
    const required = ['terms_of_use', 'privacy_policy'];
    if (required.includes(req.params.type) && !req.body.granted) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Este consentimento é obrigatório e não pode ser revogado.' } });
    }
    const consent = await lgpdService.updateConsent(req.userId, req.params.type, req.body.granted);
    res.json({ success: true, data: consent });
  } catch (err) { next(err); }
}

async function requestDataExport(req, res, next) {
  try {
    const protocol = `LGPD-${new Date().getFullYear()}-EXP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await lgpdService.createExportJob(req.userId);
    res.status(202).json({ success: true, data: { message: 'Exportação solicitada. Você receberá um e-mail com o arquivo em até 15 dias úteis.', protocol } });
  } catch (err) { next(err); }
}

async function getDataExportStatus(req, res, next) {
  try {
    const job = await lgpdService.getExportJob(req.params.jobId, req.userId);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

async function requestAccountDeletion(req, res, next) {
  try {
    const { password } = req.body;
    const user = await userService.findById(req.userId);
    const valid = await authService.comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Senha incorreta.' } });
    await sessionService.revokeAllSessions(req.userId);
    await userService.anonymize(req.userId);
    const protocol = `LGPD-${new Date().getFullYear()}-DEL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    res.json({ success: true, data: { message: 'Sua conta será excluída em até 15 dias úteis. Você receberá confirmação por e-mail.', protocol } });
  } catch (err) { next(err); }
}

module.exports = { listConsents, updateConsent, requestDataExport, getDataExportStatus, requestAccountDeletion };
