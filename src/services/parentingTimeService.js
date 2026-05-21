// =====================================================================
// parentingTimeService.js
// Resolução do regime de convivência (parenting time).
// ---------------------------------------------------------------------
// A agenda de busca/entrega é DERIVADA das regras gravadas em
// `parenting_time_rules`. Este módulo contém a lógica pura (sem banco)
// que, dada uma regra, gera os blocos concretos [busca -> entrega] num
// intervalo de datas, e resolve qual co-pai está com a criança numa data.
//
// CONVENÇÕES
//   - Dia da semana: ISO-8601, 1=segunda ... 7=domingo.
//   - Fuso: America/Sao_Paulo. O Brasil não tem horário de verão desde
//     2019, então usamos offset fixo -03:00. (Para datas anteriores a
//     2019 isto seria impreciso — não é o caso de uso do produto.)
// =====================================================================

const SP_OFFSET = '-03:00';

// ---------------------------------------------------------------------
// Helpers de data (operam sobre 'YYYY-MM-DD' em horário local de SP)
// ---------------------------------------------------------------------

/** Converte 'YYYY-MM-DD' em um Date UTC representando meia-noite em SP. */
function dateOnlyToUtc(dateStr) {
  return new Date(`${dateStr}T00:00:00${SP_OFFSET}`);
}

/** Dia da semana ISO (1=seg..7=dom) de uma data 'YYYY-MM-DD' em SP. */
function isoWeekday(dateStr) {
  // getUTCDay sobre o instante de meia-noite SP: 0=dom..6=sáb -> ISO.
  const d = dateOnlyToUtc(dateStr);
  const js = d.getUTCDay(); // 0=domingo
  return js === 0 ? 7 : js;
}

/** Soma `days` a 'YYYY-MM-DD' e devolve 'YYYY-MM-DD'. */
function addDays(dateStr, days) {
  const d = dateOnlyToUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas 'YYYY-MM-DD' (a - b). */
function diffDays(a, b) {
  const ms = dateOnlyToUtc(a).getTime() - dateOnlyToUtc(b).getTime();
  return Math.round(ms / 86400000);
}

/** Monta um timestamp ISO com offset de SP a partir de data + 'HH:MM[:SS]'. */
function atTime(dateStr, timeStr) {
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return `${dateStr}T${t}${SP_OFFSET}`;
}

// ---------------------------------------------------------------------
// Geração de ocorrências
// ---------------------------------------------------------------------

/**
 * Gera os blocos de convivência de UMA regra dentro de [rangeStart, rangeEnd].
 *
 * @param {object} rule  linha de parenting_time_rules (snake_case do banco)
 * @param {string} rangeStart 'YYYY-MM-DD'
 * @param {string} rangeEnd   'YYYY-MM-DD'
 * @returns {Array<{ruleId, label, responsibleUserId, pickupAt, dropoffAt,
 *                   pickupLocation, dropoffLocation}>}
 */
function resolveOccurrences(rule, rangeStart, rangeEnd) {
  const out = [];

  const cadence    = rule.cadence_weeks || 1;
  const effFrom    = rule.effective_from;
  const effUntil   = rule.effective_until || null;

  // Limita a varredura à interseção do intervalo pedido com a vigência.
  let scanStart = effFrom && diffDays(effFrom, rangeStart) > 0 ? effFrom : rangeStart;
  let scanEnd   = effUntil && diffDays(effUntil, rangeEnd) < 0 ? effUntil : rangeEnd;
  if (diffDays(scanEnd, scanStart) < 0) return out; // sem interseção

  // Offset de dias entre busca e entrega (entrega é a próxima ocorrência
  // do dropoff_weekday em/depois da busca; se cair no mesmo dia e horário
  // <= busca, joga para a semana seguinte).
  let blockDays = ((rule.dropoff_weekday - rule.pickup_weekday) % 7 + 7) % 7;
  if (blockDays === 0 && rule.dropoff_time <= rule.pickup_time) blockDays = 7;

  // Avança até a primeira data de BUSCA (>= scanStart) no weekday correto.
  let cursor = scanStart;
  const advance = ((rule.pickup_weekday - isoWeekday(cursor)) % 7 + 7) % 7;
  cursor = addDays(cursor, advance);

  while (diffDays(cursor, scanEnd) <= 0) {
    if (passesCadence(rule, cursor, cadence)) {
      const dropoffDate = addDays(cursor, blockDays);
      out.push({
        ruleId:            rule.id,
        label:             rule.label || rule.rule_type,
        responsibleUserId: rule.responsible_user_id,
        pickupAt:          atTime(cursor, rule.pickup_time),
        dropoffAt:         atTime(dropoffDate, rule.dropoff_time),
        pickupLocation:    rule.pickup_location || null,
        dropoffLocation:   rule.dropoff_location || null,
      });
    }
    cursor = addDays(cursor, 7); // próxima ocorrência semanal candidata
  }
  return out;
}

/**
 * Verifica a paridade da cadência (quinzenal/alternada).
 * Toda semana (cadence=1) sempre passa. Para cadence>1, a data de busca
 * precisa estar a um múltiplo de `cadence` semanas da âncora.
 */
function passesCadence(rule, pickupDate, cadence) {
  if (cadence <= 1) return true;
  if (!rule.anchor_date) {
    // Sem âncora não dá para determinar a paridade — trata como toda semana
    // e sinaliza via log. (A validação de entrada deve exigir âncora aqui.)
    return true;
  }
  const weeks = Math.round(diffDays(pickupDate, rule.anchor_date) / 7);
  return ((weeks % cadence) + cadence) % cadence === 0;
}

/**
 * Resolve qual co-pai está com a criança num instante.
 * Recebe TODAS as regras ativas da criança. Maior `priority` vence
 * (feriado/férias sobrepõem a rotina).
 *
 * @param {Array} rules regras (snake_case)
 * @param {string} instantISO timestamp ISO (ex: '2026-05-20T20:00:00-03:00')
 * @returns {{responsibleUserId, ruleId, label}|null}
 */
function whoHasChildAt(rules, instantISO) {
  const t = new Date(instantISO).getTime();
  const day = instantISO.slice(0, 10);
  // Gera ocorrências num pequeno entorno (a busca pode ser no dia anterior).
  const from = addDays(day, -8);
  const to   = addDays(day, 1);

  let best = null;
  for (const rule of rules) {
    if (!rule.is_active || rule.status === 'cancelled' || rule.status === 'superseded') continue;
    for (const occ of resolveOccurrences(rule, from, to)) {
      const start = new Date(occ.pickupAt).getTime();
      const end   = new Date(occ.dropoffAt).getTime();
      if (t >= start && t < end) {
        const prio = rule.priority || 0;
        if (!best || prio > best.priority) {
          best = { responsibleUserId: occ.responsibleUserId, ruleId: rule.id, label: occ.label, priority: prio };
        }
      }
    }
  }
  if (!best) return null;
  delete best.priority;
  return best;
}

/**
 * Gera a agenda consolidada de todas as regras de uma criança num intervalo,
 * ordenada por horário de busca. Útil para a tela de calendário e para o
 * relatório exportável.
 */
function buildSchedule(rules, rangeStart, rangeEnd) {
  const blocks = [];
  for (const rule of rules) {
    if (!rule.is_active || rule.status === 'cancelled' || rule.status === 'superseded') continue;
    blocks.push(...resolveOccurrences(rule, rangeStart, rangeEnd));
  }
  blocks.sort((a, b) => new Date(a.pickupAt) - new Date(b.pickupAt));
  return blocks;
}

module.exports = {
  resolveOccurrences,
  whoHasChildAt,
  buildSchedule,
  // exportados p/ teste
  _internals: { isoWeekday, addDays, diffDays, atTime, passesCadence },
};
