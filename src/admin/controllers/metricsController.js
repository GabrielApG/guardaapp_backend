const svc = require('../services/metricsService');

async function getOverview(req, res, next) {
  try { res.json({ success: true, data: await svc.getOverview() }); } catch (err) { next(err); }
}
async function getTimeseries(req, res, next) {
  try { res.json({ success: true, data: await svc.getTimeseries(req.query.metric, req.query.range) }); } catch (err) { next(err); }
}

module.exports = { getOverview, getTimeseries };
