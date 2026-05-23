// RBAC admin — matriz de permissões por papel
const PERMISSIONS = {
  superadmin: new Set(['*']), // curinga
  suporte: new Set([
    'users.read','users.write','users.suspend','users.reactivate','users.reset_access',
    'connections.read','moderation.read','moderation.write','tickets.read','tickets.write',
    'metrics.read',
  ]),
  financeiro: new Set([
    'users.read','connections.read','billing.read','billing.write','metrics.read',
  ]),
  auditor: new Set([
    'users.read','connections.read','billing.read','moderation.read',
    'audit.read','audit.export','metrics.read',
  ]),
  compliance_dpo: new Set([
    'users.read','connections.read','audit.read','audit.export',
    'lgpd.requests.read','lgpd.requests.write',
  ]),
};

function hasPermission(role, resource, action) {
  if (role === 'superadmin') return true;
  const set = PERMISSIONS[role];
  if (!set) return false;
  return set.has(`${resource}.${action}`) || set.has(`${resource}.*`);
}

module.exports = { PERMISSIONS, hasPermission };
