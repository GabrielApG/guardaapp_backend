const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const { formatInTimeZone } = require('date-fns-tz');

async function _buildBase(title, protocol) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  doc.fontSize(20).text('GuardaApp', { align: 'center' });
  doc.fontSize(12).text(title, { align: 'center' });
  doc.fontSize(10).text(`Protocolo: ${protocol}`, { align: 'center' });
  doc.text(`Gerado em: ${formatInTimeZone(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm")} BRT`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(9).fillColor('grey').text('DOCUMENTO COM VALOR PROBATÓRIO', { align: 'center' });
  doc.fillColor('black').moveDown();

  try {
    const qrUrl = await QRCode.toDataURL(`https://guardaapp.com.br/verify/${protocol}`);
    doc.image(qrUrl, doc.page.width - 100, 50, { width: 60 });
  } catch { /* qr opcional */ }

  return { doc, chunks };
}

async function generateMessagesPdf(messages, connectionId) {
  const protocol = `GA-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { doc, chunks } = await _buildBase('Histórico de Mensagens', protocol);

  messages.forEach((m) => {
    const date = formatInTimeZone(m.created_at, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    doc.fontSize(9).text(`[${date}] ${m.text}`, { paragraphGap: 4 });
    doc.fontSize(7).fillColor('grey').text(`Hash: ${m.hash}`).fillColor('black');
    doc.moveDown(0.5);
  });

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

async function generateAuditPdf(events, connectionId) {
  const protocol = `AU-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { doc, chunks } = await _buildBase('Trilha de Auditoria', protocol);

  events.forEach((e) => {
    const date = formatInTimeZone(e.created_at, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    doc.fontSize(9).text(`[${date}] [${e.event_type.toUpperCase()}] ${e.description}`, { paragraphGap: 4 });
    doc.fontSize(7).fillColor('grey').text(`Hash: ${e.hash} | Anterior: ${e.previous_hash || 'genesis'}`).fillColor('black');
    doc.moveDown(0.5);
  });

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

async function generateExpensePdf(expenses, connectionId) {
  const protocol = `EXP-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { doc, chunks } = await _buildBase('Relatório de Despesas', protocol);

  let total = 0;
  expenses.forEach((e) => {
    doc.fontSize(9).text(`${e.title} — R$ ${parseFloat(e.amount).toFixed(2)} [${e.status}]`, { paragraphGap: 4 });
    total += parseFloat(e.amount);
  });
  doc.moveDown().fontSize(11).text(`Total: R$ ${total.toFixed(2)}`);

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

/**
 * Extrato de pensão alimentícia com validade jurídica.
 * Contém cabeçalho das partes, tabela de parcelas, pagamentos com hash e declaração de integridade.
 */
async function generateSupportExtractPdf(extractData, connectionId) {
  const protocol = `PEN-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { doc, chunks } = await _buildBase('Extrato de Pensão Alimentícia', protocol);

  // Cabeçalho — partes
  doc.fontSize(10).text('PARTES ENVOLVIDAS', { underline: true }).moveDown(0.3);
  (extractData.parties || []).forEach(p => {
    doc.fontSize(9).text(`• ${p.name}`);
  });
  if (extractData.period?.startMonth || extractData.period?.endMonth) {
    doc.moveDown(0.3).fontSize(9).text(
      `Período: ${extractData.period.startMonth || 'início'} a ${extractData.period.endMonth || 'atual'}`
    );
  }
  doc.moveDown();

  // Parcelas
  doc.fontSize(10).text('PARCELAS', { underline: true }).moveDown(0.3);
  for (const inst of (extractData.installments || [])) {
    const statusLabel = { pago: 'PAGO', pago_parcial: 'PARCIAL', atrasado: 'ATRASADO', pendente: 'PENDENTE', contestado: 'CONTESTADO', dispensado: 'DISPENSADO' }[inst.status] || inst.status.toUpperCase();
    doc.fontSize(9).fillColor('black')
      .text(`${inst.reference_month}  Venc: ${inst.due_date}  Devido: R$ ${parseFloat(inst.amount_due).toFixed(2)}  Pago: R$ ${parseFloat(inst.amount_paid || 0).toFixed(2)}  [${statusLabel}]`, { paragraphGap: 2 });
    for (const pmt of (inst.payments || [])) {
      const pmtDate = pmt.paid_at ? formatInTimeZone(new Date(pmt.paid_at), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : '-';
      doc.fontSize(8).fillColor('#333333')
        .text(`  ↳ ${pmt.kind === 'estorno' ? '[ESTORNO]' : '[PGTO]'} R$ ${parseFloat(pmt.amount).toFixed(2)} | ${pmt.payment_mode} | ${pmtDate} | ${pmt.confirmation_status} | Comprovante: ${pmt.hasReceipt ? 'Sim' : 'Não'}`, { paragraphGap: 1 });
      doc.fontSize(7).fillColor('grey')
        .text(`    Hash: ${pmt.hash}`).fillColor('black');
    }
    doc.moveDown(0.5);
  }

  // Rodapé de integridade
  doc.moveDown().fontSize(8).fillColor('grey')
    .text(
      `Documento gerado pelo GuardaApp em ${formatInTimeZone(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm")} BRT.\n` +
      `Trilha de auditoria append-only verificável. Protocolo: ${protocol}.\n` +
      `Este documento possui valor probatório e foi gerado de forma automatizada e inviolável.`,
      { align: 'center' }
    );

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

/**
 * Relatório de auditoria administrativa (painel admin).
 */
async function generateAdminAuditPdf(events) {
  const protocol = `ADM-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { doc, chunks } = await _buildBase('Relatório de Auditoria Administrativa', protocol);

  events.forEach((e) => {
    const date = formatInTimeZone(new Date(e.created_at), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    doc.fontSize(9).text(`[${date}] [${e.action}] ${e.description}`, { paragraphGap: 3 });
    if (e.target_type) doc.fontSize(8).fillColor('#444').text(`  Alvo: ${e.target_type} ${e.target_id || ''}`).fillColor('black');
    if (e.ip) doc.fontSize(7).fillColor('grey').text(`  IP: ${e.ip} | Hash: ${e.hash}`).fillColor('black');
    doc.moveDown(0.3);
  });

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

/**
 * Certificado de Momento Probatório — SPEC_MOMENTOS_PROBATORIOS.md §6.3
 *
 * Contém: foto incorporada, tabela de metadados por camada (L1–L4),
 * hashes de conteúdo e registro, QR de verificação, declaração de integridade
 * e ressalvas jurídicas obrigatórias.
 *
 * @param {object} opts
 * @param {object}  opts.evidence          - linha da milestone_evidence
 * @param {object}  opts.integrity         - resultado de verifyEvidenceIntegrity
 * @param {Buffer|null} opts.photoBuffer   - binário da imagem (null = indisponível)
 * @param {boolean} opts.contentHashVerified - se o hash do binário confere
 */
async function generateMilestoneCertificatePdf({ evidence: ev, integrity, photoBuffer, contentHashVerified }) {
  const protocol = ev.protocol;
  const L = 50;                               // margem esquerda
  const doc = new PDFDocument({ margin: L, size: 'A4' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  const pageW  = doc.page.width;              // 595.28
  const W      = pageW - L * 2;              // largura útil: 495.28
  const QR_W   = 80;
  const QR_X   = pageW - L - QR_W;           // QR começa em 465.28
  const TEXT_W = QR_X - L - 8;               // texto fica em [50, 407] → 357 pts

  const brtNow       = formatInTimeZone(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm");
  const verdictOk    = integrity.verdict === 'ÍNTEGRO';
  const verdictColor = verdictOk ? '#166534' : '#991b1b';
  const verdictBg    = verdictOk ? '#f0fdf4' : '#fef2f2';

  // ── Cabeçalho (texto na faixa esquerda; QR fixo à direita) ─────────────────
  const headerStartY = doc.y;                 // ≈ 50

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111')
    .text('GuardaApp', L, headerStartY, { width: TEXT_W, align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor('#333333')
    .text('Certificado de Momento Probatório', { width: TEXT_W, align: 'center' });
  doc.fontSize(9).fillColor('#666666')
    .text(`Protocolo: ${protocol}`, { width: TEXT_W, align: 'center' })
    .text(`Gerado em: ${brtNow} BRT`, { width: TEXT_W, align: 'center' });

  // QR — posição absoluta, alinhado ao topo do cabeçalho
  try {
    const baseUrl = process.env.APP_BASE_URL || 'https://guardaapp.com.br';
    const qrData  = await QRCode.toDataURL(`${baseUrl}/verify/${protocol}`, { margin: 1 });
    doc.image(qrData, QR_X, headerStartY, { width: QR_W });
    doc.font('Helvetica').fontSize(6.5).fillColor('#888888')
      .text('Escaneie para verificar', QR_X, headerStartY + QR_W + 3, { width: QR_W, align: 'center' });
  } catch { /* QR opcional */ }

  doc.fillColor('#111111').moveDown(1.2);

  // ── Veredito — caixa colorida ───────────────────────────────────────────────
  const vY = doc.y;
  doc.rect(L, vY, W, 40).fill(verdictBg);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(verdictColor)
    .text(`Integridade: ${integrity.verdict}`, L + 10, vY + 7, { width: W - 20 });
  doc.font('Helvetica').fontSize(8).fillColor(verdictColor)
    .text(
      verdictOk
        ? 'Hash do registro confere com o payload canônico e o encadeamento é válido.'
        : 'ATENÇÃO: divergência detectada. Este registro pode ter sido adulterado.',
      L + 10, vY + 23, { width: W - 20 }
    );
  doc.y = vY + 48;
  doc.fillColor('#111111');

  // ── Foto ────────────────────────────────────────────────────────────────────
  if (photoBuffer) {
    try {
      const maxH  = 200;
      const imgY  = doc.y + 4;
      doc.image(photoBuffer, L, imgY, { fit: [W, maxH], align: 'center' });
      // PDFKit avança doc.y após image(); adicionamos só um pequeno gap
      doc.moveDown(0.6);
      const hashLabel = contentHashVerified
        ? '✓ Hash do binário verificado pelo servidor'
        : '(verificação do hash do binário não executada neste certificado)';
      doc.font('Helvetica').fontSize(7).fillColor('#888888').text(hashLabel, { align: 'center' });
      doc.fillColor('#111111');
    } catch {
      doc.font('Helvetica').fontSize(9).fillColor('#888888')
        .text('[Foto não pôde ser incorporada]').fillColor('#111111');
    }
  } else {
    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text('[Foto não disponível — verificar armazenamento]').fillColor('#111111');
  }
  doc.moveDown(0.8);

  // ── Helper: campo label + valor ─────────────────────────────────────────────
  // label em negrito na própria linha; valor na linha seguinte, indentado.
  // Evita completely o `continued: true` que causa overflow horizontal.
  function row(label, value, note) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555')
      .text(label + ':', { indent: 0 });
    doc.font('Helvetica').fontSize(9).fillColor('#111111')
      .text(value || '—', { indent: 14 });
    if (note) {
      doc.font('Helvetica').fontSize(7).fillColor('#888888')
        .text(note, { indent: 14 });
    }
    doc.fillColor('#111111');
    doc.moveDown(0.35);
  }

  function sectionHeader(title) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
      .text(title, { underline: true });
    doc.font('Helvetica').moveDown(0.3);
  }

  // ── L2 — Servidor ──────────────────────────────────────────────────────────
  sectionHeader('L2 — DADOS OBSERVADOS PELO SERVIDOR (fonte de verdade temporal)');
  const srvAt = ev.server_received_at
    ? formatInTimeZone(new Date(ev.server_received_at), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss.SSS") + ' BRT'
    : '—';
  row('Recebido pelo servidor', srvAt,
    'Relógio NTP do servidor — referência temporal principal');
  row('IP de origem', ev.source_ip || '—',
    'IPv4/IPv6 do aparelho na chegada da requisição');
  row('User-Agent', ev.user_agent ? ev.user_agent.substring(0, 100) : '—', null);
  if (ev.geoip_city || ev.geoip_region) {
    row('Localização aprox. (geo-IP)',
      [ev.geoip_city, ev.geoip_region, ev.geoip_country ? `(${ev.geoip_country})` : null].filter(Boolean).join(', '),
      `Fonte: ${ev.geoip_source || '—'} — cidade da operadora/rede, NÃO localização exata`);
  } else {
    row('Localização (geo-IP)', '—', `Fonte: ${ev.geoip_source || 'indisponível'}`);
  }
  if (ev.clock_delta_ms !== null && ev.clock_delta_ms !== undefined) {
    const d = Number(ev.clock_delta_ms);
    const secs = Math.round(d / 1000);
    row('Divergência de relógio (servidor − aparelho)',
      `${secs >= 0 ? '+' : ''}${secs}s (${d} ms)`,
      Math.abs(d) > 120000
        ? 'ATENÇÃO: divergência alta — relógio do aparelho pode estar incorreto ou adulterado'
        : 'Diferença entre o relógio do servidor (NTP) e o do aparelho no momento da captura');
  }
  doc.moveDown(0.5);

  // ── L1 — Dispositivo ───────────────────────────────────────────────────────
  sectionHeader('L1 — DADOS DECLARADOS PELO DISPOSITIVO (informativo, forjável)');
  doc.font('Helvetica').fontSize(8).fillColor('#92400e')
    .text('Atenção: metadados abaixo foram enviados pelo aplicativo do dispositivo e não constituem prova independente.')
    .fillColor('#111111').moveDown(0.3);

  row('Marca/Modelo',
    [ev.device_brand, ev.device_model].filter(Boolean).join(' ') || '—', null);
  row('Sistema operacional',
    [ev.device_os, ev.device_os_version].filter(Boolean).join(' ') || '—', null);
  row('Nome do dispositivo', ev.device_name || '—', null);
  if (ev.client_captured_at) {
    row('Timestamp do aparelho',
      formatInTimeZone(new Date(ev.client_captured_at), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss") + ' BRT',
      `Fuso declarado: ${ev.client_timezone || '—'} — relógio do celular (pode estar errado)`);
  }
  if (ev.exif_taken_at) {
    row('EXIF DateTimeOriginal',
      formatInTimeZone(new Date(ev.exif_taken_at), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss") + ' BRT',
      'Timestamp gravado pela câmera no EXIF — pode diferir do horário real');
  }
  row('GPS (EXIF)',
    (ev.exif_gps_lat !== null && ev.exif_gps_lng !== null)
      ? `${parseFloat(ev.exif_gps_lat).toFixed(5)}, ${parseFloat(ev.exif_gps_lng).toFixed(5)}`
      : '—',
    (ev.exif_gps_lat !== null && ev.exif_gps_lng !== null)
      ? 'Coordenadas gravadas pela câmera — requer GPS ativo no dispositivo'
      : 'Câmera sem GPS ativo ou dado não disponível');
  row('Integridade do aparelho (root/jailbreak)',
    ev.device_is_rooted === null || ev.device_is_rooted === undefined
      ? 'Não verificado'
      : (ev.device_is_rooted
          ? 'DETECTADO — aparelho com root/jailbreak (confiabilidade da camada L1 reduzida)'
          : 'Não detectado — aparelho aparentemente íntegro'),
    'Verificação experimental no app — pode ser burlada em aparelhos comprometidos');
  doc.moveDown(0.5);

  // ── L3 — Integridade do conteúdo ───────────────────────────────────────────
  sectionHeader('L3 — INTEGRIDADE DO CONTEÚDO (hash calculado no servidor)');
  row('SHA-256 da imagem', ev.content_sha256,
    'Calculado pelo servidor a partir do binário recebido — não confia no client');
  row('Tipo / Tamanho',
    `${ev.content_type} / ${Number(ev.byte_size).toLocaleString('pt-BR')} bytes`, null);
  row('Verificação do binário',
    contentHashVerified
      ? 'CONFIRMADO — hash do MinIO bate com o registrado'
      : 'Não executada neste certificado', null);
  doc.moveDown(0.5);

  // ── L4 — Encadeamento ──────────────────────────────────────────────────────
  sectionHeader('L4 — ENCADEAMENTO (trilha de auditoria append-only)');
  row('Hash do registro', ev.record_hash,
    'SHA-256 do payload canônico + hash anterior — adulteração retroativa é detectável');
  row('Hash anterior',
    ev.previous_hash || 'gênese (primeiro registro desta conexão)', null);
  row('Encadeamento',
    integrity.chainValid ? 'VÁLIDO — elo com registro anterior confirmado' : 'INVÁLIDO', null);
  row('Hash match',
    integrity.hashMatch ? 'CONFIRMADO — payload não foi alterado' : 'FALHOU', null);
  if (ev.audit_event_id) {
    row('ID de auditoria geral', ev.audit_event_id,
      'Cruzamento com a trilha de audit_events');
  }
  doc.moveDown(0.5);

  // ── L5 — Carimbo de tempo RFC 3161 (ICP-Brasil) ─────────────────────────────
  sectionHeader('L5 — CARIMBO DE TEMPO RFC 3161 (Autoridade de Carimbo do Tempo ICP-Brasil)');
  if (ev.tsa_status === 'sealed' && ev.tsa_token) {
    const genAt = ev.tsa_gentime
      ? formatInTimeZone(new Date(ev.tsa_gentime), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss") + ' BRT'
      : '—';
    row('Status', 'SELADO — carimbo de tempo obtido de terceiro confiável', null);
    row('Autoridade (ACT)', ev.tsa_authority || '—',
      'ACT credenciada ICP-Brasil — fé pública e independência (MP 2.200-2/2001)');
    row('Hora oficial atestada', genAt,
      'genTime sincronizado à Hora Legal Brasileira (Observatório Nacional)');
    row('Número de série do token', ev.tsa_serial || '—', null);
    if (ev.tsa_sealed_at) {
      row('Selado pelo servidor em',
        formatInTimeZone(new Date(ev.tsa_sealed_at), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss") + ' BRT', null);
    }
    row('O que isto comprova',
      'Que o hash do registro (L4) já existia na hora oficial atestada acima, segundo terceiro independente — não depende da palavra do GuardaApp.', null);
  } else {
    const label = ev.tsa_status === 'failed'
      ? 'NÃO SELADO — tentativas de carimbo falharam'
      : 'PENDENTE — carimbo ainda não obtido (reprocessamento automático em curso)';
    row('Status', label,
      ev.tsa_last_error
        ? `Último erro: ${String(ev.tsa_last_error).substring(0, 120)}`
        : 'Carimbo de tempo RFC 3161 ainda não disponível neste registro');
  }

  // ── Página 2 — Declaração jurídica ─────────────────────────────────────────
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111')
    .text('DECLARAÇÃO DE INTEGRIDADE E RESSALVAS JURÍDICAS', { underline: true, align: 'center' });
  doc.font('Helvetica').moveDown(1);

  const sealed = ev.tsa_status === 'sealed' && ev.tsa_token;
  const item2 = sealed
    ? '2. A força probatória principal deriva de: (a) o hash SHA-256 da imagem calculado pelo servidor no momento do ' +
      'recebimento (L3); (b) o encadeamento de registros append-only onde cada entrada depende da anterior, ' +
      'tornando adulteração retroativa detectável (L4); (c) o carimbo de tempo do servidor (NTP); e (d) o carimbo ' +
      'de tempo RFC 3161 de Autoridade de Carimbo do Tempo credenciada ICP-Brasil (L5), que atesta, por terceiro ' +
      'independente e com fé pública, a existência do registro na hora oficial indicada.'
    : '2. A força probatória principal deriva de: (a) o hash SHA-256 da imagem calculado pelo servidor no momento do ' +
      'recebimento (L3); (b) o encadeamento de registros append-only onde cada entrada depende da anterior, ' +
      'tornando adulteração retroativa detectável (L4); (c) o carimbo de tempo do servidor (NTP).';
  const item5 = sealed
    ? '5. Este registro possui carimbo de tempo RFC 3161 emitido por ACT credenciada ICP-Brasil (MP 2.200-2/2001), ' +
      'sincronizado à Hora Legal Brasileira mantida pelo Observatório Nacional. O token pode ser verificado de ' +
      'forma independente contra a cadeia da AC-Raiz ICP-Brasil, comprovando que o hash do registro (L4) já ' +
      'existia na hora atestada — sem depender da palavra do GuardaApp.'
    : '5. O carimbo de tempo de terceiro (RFC 3161 / ICP-Brasil) ainda NÃO foi aplicado a este registro ' +
      `(status: ${ev.tsa_status || 'pendente'}). Até a selagem, a referência temporal independente é apenas o ` +
      'carimbo de tempo do servidor (NTP), interno ao GuardaApp.';

  doc.fontSize(9).fillColor('#111111').text(
    'Este certificado foi gerado automaticamente pelo sistema GuardaApp e documenta o registro de um momento com ' +
    '"Selo de Integridade e Trilha de Auditoria". NÃO constitui garantia de autenticidade absoluta nem ' +
    'substitui perícia técnica judicial.\n\n' +
    '1. Os dados de dispositivo (L1) são declarados pelo aplicativo cliente e podem ser forjados em aparelhos ' +
    'comprometidos (root, câmera virtual, mock location). Valem como indício corroborativo.\n\n' +
    item2 + '\n\n' +
    '3. A geolocalização exibida é aproximada (cidade da operadora/rede via geo-IP). Não representa ' +
    'localização exata do usuário.\n\n' +
    '4. O fluxo de captura exige abertura direta da câmera (sem galeria), impedindo o caminho casual de ' +
    'seleção de imagem existente, mas não garante contra dispositivos comprometidos com câmera virtual.\n\n' +
    item5 + '\n\n' +
    'Linguagem aprovada: "Registro com selo de integridade e trilha de auditoria."\n' +
    'NÃO usar: "prova inviolável", "validade jurídica garantida" ou expressões equivalentes.',
    { align: 'justify' }
  );

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#888888').text(
    `GuardaApp · Protocolo ${protocol} · Gerado em ${brtNow} BRT · guardaapp.com.br/verify/${protocol}`,
    { align: 'center' }
  );

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

module.exports = { generateMessagesPdf, generateAuditPdf, generateExpensePdf, generateSupportExtractPdf, generateAdminAuditPdf, generateMilestoneCertificatePdf };
