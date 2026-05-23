const db = require('../../config/database');
const adminAuditService = require('./adminAuditService');

async function listPlans() {
  return [
    { id: 'free',    name: 'Gratuito', price_brl: 0,     features: ['Calendário', 'Mensagens básicas', '1 filho'] },
    { id: 'basic',   name: 'Básico',   price_brl: 29.90, features: ['Calendário', 'Mensagens', 'Despesas', 'Documentos', 'Saúde'] },
    { id: 'premium', name: 'Premium',  price_brl: 59.90, features: ['Tudo do Básico', 'PDF assinado', 'Pensão alimentícia', 'Filhos ilimitados'] },
  ];
}

async function listSubscriptions(filters = {}) {
  // Tabela billing_subscriptions futura
  return { subscriptions: [], total: 0 };
}

async function processRefund(actorId, subscriptionId, { amount, reason }, ip) {
  await adminAuditService.log(actorId, 'billing.refund', {
    targetType: 'subscription', targetId: subscriptionId,
    description: `Reembolso de R$ ${parseFloat(amount).toFixed(2)}. Motivo: ${reason}`,
    metadata: { amount, reason }, ip,
  });
  return { refunded: true, amount: parseFloat(amount) };
}

async function getReports(filters = {}) {
  const range = filters.range || '30d';
  return { mrr: 0, newSubscriptions: 0, churn: 0, range };
}

module.exports = { listPlans, listSubscriptions, processRefund, getReports };
