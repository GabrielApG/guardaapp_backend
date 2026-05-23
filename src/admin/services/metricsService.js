const db = require('../../config/database');

async function getOverview() {
  const [[{ activeUsers }]]  = await db.query("SELECT COUNT(*) as activeUsers  FROM users WHERE is_active = 1 AND deleted_at IS NULL");
  const [[{ newConns }]]     = await db.query("SELECT COUNT(*) as newConns     FROM coparent_connections WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
  const [[{ openTickets }]]  = await db.query("SELECT COUNT(*) as openTickets  FROM support_tickets WHERE status NOT IN ('resolvido','fechado')");
  const [[{ pendingFlags }]] = await db.query("SELECT COUNT(*) as pendingFlags FROM moderation_flags WHERE status = 'pendente'");
  return { activeUsers, newConnections30d: newConns, mrr: 0, openTickets, pendingFlags };
}

async function getTimeseries(metric, range = '30d') {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  let sql, label;
  if (metric === 'signups') {
    sql   = `SELECT DATE(created_at) as date, COUNT(*) as value FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date`;
    label = 'Novos usuários';
  } else if (metric === 'connections') {
    sql   = `SELECT DATE(created_at) as date, COUNT(*) as value FROM coparent_connections WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date`;
    label = 'Novas conexões';
  } else {
    return { metric, label: metric, data: [] };
  }
  const [data] = await db.query(sql);
  return { metric, label, data };
}

module.exports = { getOverview, getTimeseries };
