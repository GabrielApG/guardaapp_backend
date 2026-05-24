/**
 * timestampService.js — Carimbo de tempo RFC 3161 (ICP-Brasil) para Momentos Probatórios
 *
 * Ref: docs/arquitetura-diario-probatorio.md §5 / SPEC_MOMENTOS_PROBATORIOS.md §9
 *
 * Por que existe:
 * A hash chain interna (L4) prova que o GuardaApp não alterou o registro depois de criado,
 * mas o GuardaApp é parte da relação. O carimbo de tempo de uma ACT credenciada ICP-Brasil
 * (CAIXA, SERPRO, CERTISIGN, VALID, BRY, QUICKSOFT) prova, com fé pública e independência,
 * que aquele record_hash já existia naquele instante — sincronizado à Hora Legal Brasileira
 * (Observatório Nacional). Base legal: MP 2.200-2/2001 + ITI DOC-ICP-11/12. Protocolo: RFC 3161.
 *
 * Restrição de plataforma: é PROIBIDO instalar novos pacotes npm. Por isso o protocolo
 * RFC 3161 (ASN.1/DER) é tratado via binário `openssl` (presente no SO do container) através
 * de child_process, e o POST à ACT usa `fetch` nativo do Node 20. Nenhuma dependência nova.
 *
 * O carimbo é aplicado SOBRE o record_hash (L4) já calculado; não entra no payload canônico,
 * portanto NÃO invalida o hash nem a cadeia. Selagem é assíncrona e idempotente.
 *
 * Configuração (.env):
 *   TSA_URL          endpoint da ACT (obrigatório p/ habilitar). Ex.: https://act.serpro.gov.br/tsa
 *   TSA_AUTH_BASIC   "usuario:senha" para Basic Auth, se a ACT exigir (opcional)
 *   TSA_CA_FILE      caminho do PEM com a cadeia da ACT/AC-Raiz ICP-Brasil p/ verificação (opcional, recomendado)
 *   TSA_HASH_ALG     algoritmo do digest (default: sha256)
 *   TSA_MAX_ATTEMPTS tentativas antes de desistir (default: 5)
 *   TSA_TIMEOUT_MS   timeout da chamada HTTP à ACT (default: 8000)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs     = require('fs/promises');
const os     = require('os');
const path   = require('path');
const db     = require('../config/database');
const auditService = require('./auditService');

const execFileP = promisify(execFile);

const HASH_ALG     = (process.env.TSA_HASH_ALG || 'sha256').toLowerCase();
const MAX_ATTEMPTS = parseInt(process.env.TSA_MAX_ATTEMPTS || '5', 10);
const TIMEOUT_MS   = parseInt(process.env.TSA_TIMEOUT_MS || '8000', 10);

function isEnabled() {
  return !!process.env.TSA_URL;
}

// ─── Util: arquivo temporário com limpeza garantida ───────────────────────────

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'guardaapp-tsa-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── RFC 3161: monta a requisição (TimeStampReq, DER) a partir de um hash hex ──

async function buildTimeStampQuery(hashHex, dir) {
  const tsqPath = path.join(dir, 'request.tsq');
  // -digest aceita o hash já calculado (não precisamos do binário original aqui).
  // -cert pede que o token inclua o certificado da ACT (necessário p/ verificação posterior).
  await execFileP('openssl', [
    'ts', '-query',
    '-digest', hashHex,
    `-${HASH_ALG}`,
    '-cert',
    '-out', tsqPath,
  ]);
  return fs.readFile(tsqPath);
}

// ─── RFC 3161: parseia o TimeStampResp para extrair genTime e serial ──────────

async function parseTimeStampReply(tsrBuffer, dir) {
  const tsrPath = path.join(dir, 'response.tsr');
  await fs.writeFile(tsrPath, tsrBuffer);
  const { stdout } = await execFileP('openssl', ['ts', '-reply', '-in', tsrPath, '-text']);

  // Extração tolerante a variações de formatação do openssl
  const statusMatch  = stdout.match(/Status:\s*(.+)/i);
  const status       = statusMatch ? statusMatch[1].trim() : null;
  const timeMatch    = stdout.match(/Time stamp:\s*(.+)/i);
  const serialMatch  = stdout.match(/Serial number:\s*(.+)/i);
  const tsaMatch     = stdout.match(/TSA:\s*(.+)/i);

  let genTime = null;
  if (timeMatch) {
    const d = new Date(timeMatch[1].trim());
    genTime = isNaN(d.getTime()) ? null : d;
  }

  return {
    status,
    granted: status ? /granted/i.test(status) : true, // alguns retornos não trazem Status explícito
    genTime,
    serial: serialMatch ? serialMatch[1].trim() : null,
    tsa:    tsaMatch ? tsaMatch[1].trim() : null,
  };
}

// ─── RFC 3161: verificação criptográfica contra a cadeia da ACT (opcional) ────

async function verifyToken(hashHex, tsrBuffer, dir) {
  const caFile = process.env.TSA_CA_FILE;
  if (!caFile) return { verified: false, reason: 'TSA_CA_FILE não configurado' };
  const tsrPath = path.join(dir, 'verify.tsr');
  await fs.writeFile(tsrPath, tsrBuffer);
  try {
    const { stdout } = await execFileP('openssl', [
      'ts', '-verify',
      '-digest', hashHex,
      `-${HASH_ALG}`,
      '-in', tsrPath,
      '-CAfile', caFile,
    ]);
    return { verified: /Verification:\s*OK/i.test(stdout), reason: stdout.trim() };
  } catch (err) {
    return { verified: false, reason: (err.stderr || err.message || '').toString().trim() };
  }
}

// ─── Solicita um carimbo de tempo para um hash hex (record_hash) ──────────────

/**
 * @param {string} hashHex - digest hex (64 chars p/ sha256) a ser carimbado
 * @returns {{ tokenBuffer: Buffer, genTime: Date|null, serial: string|null, authority: string|null }}
 * @throws  se a ACT recusar, der timeout ou retornar resposta inválida
 */
async function requestTimestamp(hashHex) {
  if (!isEnabled()) throw new Error('TSA não configurada (TSA_URL ausente)');
  if (!/^[0-9a-f]{64}$/i.test(hashHex) && HASH_ALG === 'sha256') {
    throw new Error('hash inválido para sha256 (esperado 64 hex chars)');
  }

  return withTempDir(async (dir) => {
    const tsq = await buildTimeStampQuery(hashHex, dir);

    const headers = { 'Content-Type': 'application/timestamp-query' };
    if (process.env.TSA_AUTH_BASIC) {
      headers['Authorization'] = 'Basic ' + Buffer.from(process.env.TSA_AUTH_BASIC).toString('base64');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(process.env.TSA_URL, {
        method: 'POST',
        headers,
        body: tsq,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`ACT respondeu HTTP ${res.status}`);

    const tokenBuffer = Buffer.from(await res.arrayBuffer());
    const parsed = await parseTimeStampReply(tokenBuffer, dir);
    if (!parsed.granted) throw new Error(`ACT recusou o carimbo: ${parsed.status || 'status desconhecido'}`);

    // Verificação criptográfica (não bloqueia o selo se CA não estiver configurado,
    // mas registra o resultado para a trilha de auditoria).
    const verification = await verifyToken(hashHex, tokenBuffer, dir);

    return {
      tokenBuffer,
      genTime:   parsed.genTime,
      serial:    parsed.serial,
      authority: parsed.tsa || process.env.TSA_URL,
      verification,
    };
  });
}

// ─── Selagem de uma evidência (idempotente, com contagem de tentativas) ───────

/**
 * Obtém e armazena o carimbo de tempo RFC 3161 para uma evidência.
 * Idempotente: se já estiver 'sealed', retorna sem reprocessar.
 * Falhas não lançam para o chamador fire-and-forget; marcam tsa_status='failed'.
 *
 * @param {string} evidenceId
 * @returns {{ sealed: boolean, status: string, error?: string }}
 */
async function sealEvidence(evidenceId) {
  if (!isEnabled()) return { sealed: false, status: 'disabled' };

  const [rows] = await db.query(
    'SELECT id, connection_id, captured_by_id, protocol, record_hash, tsa_status, tsa_attempts FROM milestone_evidence WHERE id = ?',
    [evidenceId]
  );
  const ev = rows[0];
  if (!ev) return { sealed: false, status: 'not_found' };
  if (ev.tsa_status === 'sealed') return { sealed: true, status: 'sealed' };

  const attempts = (ev.tsa_attempts || 0) + 1;

  try {
    const { tokenBuffer, genTime, serial, authority, verification } = await requestTimestamp(ev.record_hash);

    // UPDATE único permitido para campos tsa_* (exceção controlada de imutabilidade,
    // análoga ao preenchimento do qr_minio_key). Guarda condição tsa_status<>'sealed'
    // para evitar corrida com outra tentativa concorrente.
    await db.query(
      `UPDATE milestone_evidence
          SET tsa_token = ?, tsa_authority = ?, tsa_gentime = ?, tsa_serial = ?,
              tsa_status = 'sealed', tsa_sealed_at = CURRENT_TIMESTAMP(3),
              tsa_attempts = ?, tsa_last_error = NULL
        WHERE id = ? AND tsa_status <> 'sealed'`,
      [tokenBuffer, authority, genTime, serial, attempts, evidenceId]
    );

    // Auditoria geral encadeada — registra o ato de selagem (metadados, sem o token bruto)
    await auditService.log(
      ev.connection_id, ev.captured_by_id, 'milestone',
      'Carimbo de tempo RFC 3161 aplicado ao momento probatório',
      {
        protocol: ev.protocol,
        recordHash: ev.record_hash,
        tsaAuthority: authority,
        tsaSerial: serial,
        tsaGenTime: genTime ? genTime.toISOString() : null,
        cryptoVerified: verification ? verification.verified : null,
      }
    ).catch(() => {});

    return { sealed: true, status: 'sealed' };
  } catch (err) {
    const msg = (err.message || 'erro desconhecido').slice(0, 255);
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await db.query(
      `UPDATE milestone_evidence
          SET tsa_status = ?, tsa_attempts = ?, tsa_last_error = ?
        WHERE id = ? AND tsa_status <> 'sealed'`,
      [status, attempts, msg, evidenceId]
    ).catch(() => {});
    return { sealed: false, status, error: msg };
  }
}

// ─── Worker de retentativa (mesmo padrão de startNotificationJobs) ────────────

async function processPending(batchSize = 20) {
  if (!isEnabled()) return 0;
  const [rows] = await db.query(
    `SELECT id FROM milestone_evidence
       WHERE tsa_status IN ('pending','failed') AND tsa_attempts < ?
       ORDER BY created_at ASC
       LIMIT ?`,
    [MAX_ATTEMPTS, batchSize]
  );
  let sealed = 0;
  for (const r of rows) {
    const out = await sealEvidence(r.id);
    if (out.sealed) sealed++;
  }
  return sealed;
}

function startTimestampJobs() {
  if (!isEnabled()) {
    console.log('[tsa] TSA_URL não configurada — carimbo de tempo RFC 3161 desabilitado.');
    return;
  }
  const INTERVAL_MS = 5 * 60 * 1000; // a cada 5 min
  setInterval(async () => {
    try {
      const n = await processPending();
      if (n) console.log(`[tsa] ${n} evidência(s) carimbada(s) nesta rodada.`);
    } catch (err) {
      console.error('[tsa] processPending error:', err.message);
    }
  }, INTERVAL_MS);

  // Disparo imediato no boot p/ limpar backlog acumulado enquanto a ACT esteve indisponível
  processPending().catch(err => console.error('[tsa] initial processPending error:', err.message));
  console.log('[tsa] Worker de carimbo de tempo RFC 3161 iniciado.');
}

module.exports = {
  isEnabled,
  requestTimestamp,
  sealEvidence,
  processPending,
  startTimestampJobs,
};
