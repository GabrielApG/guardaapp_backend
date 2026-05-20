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

module.exports = { generateMessagesPdf, generateAuditPdf, generateExpensePdf };
