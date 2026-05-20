'use strict';

// ─── Primitives ───────────────────────────────────────────────────────────────

function baseLayout({ title, preheader, content }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>GuardaApp</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF9F6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAF9F6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#3F5A47;border-radius:14px 14px 0 0;padding:28px 40px;text-align:center;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:22px;font-weight:500;color:#FFFFFF;letter-spacing:-0.4px;">GuardaApp</p>
              ${title ? `<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:11px;font-weight:500;color:rgba(255,255,255,0.70);letter-spacing:1.2px;text-transform:uppercase;">${title}</p>` : ''}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-left:0.5px solid #DDDAD0;border-right:0.5px solid #DDDAD0;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F1EFE9;border-radius:0 0 14px 14px;border:0.5px solid #DDDAD0;border-top:none;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:12px;color:#8A877D;line-height:1.5;">© 2026 GuardaApp · Plataforma segura para co-parentalidade</p>
              <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:11px;color:#8A877D;line-height:1.5;">Você recebeu este e-mail pois possui uma conta no GuardaApp.<br>Se não reconhece esta ação, ignore este e-mail com segurança.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function h1(text) {
  return `<h1 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:24px;font-weight:500;color:#1A1917;letter-spacing:-0.4px;line-height:1.30;">${text}</h1>`;
}

function p(text, secondary = false) {
  return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:14px;font-weight:400;color:${secondary ? '#57554E' : '#1A1917'};line-height:1.60;">${text}</p>`;
}

function note(text) {
  return `<p style="margin:28px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:12px;color:#8A877D;line-height:1.50;padding-top:20px;border-top:0.5px solid #DDDAD0;">${text}</p>`;
}

function divider() {
  return `<div style="height:0.5px;background-color:#DDDAD0;margin:24px 0;"></div>`;
}

function codeBlock(code) {
  return `<div style="margin:28px 0;padding:20px;background-color:#F1EFE9;border-radius:10px;border:0.5px solid #DDDAD0;text-align:center;">
    <span style="font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:400;color:#243A2A;letter-spacing:6px;">${code}</span>
  </div>`;
}

function infoBox(text) {
  return `<div style="margin:20px 0;padding:16px 20px;background-color:#F0F4F1;border-radius:10px;border-left:3px solid #3F5A47;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:13px;color:#3F5A47;line-height:1.50;">${text}</p>
  </div>`;
}

function ctaButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto 0;">
    <tr>
      <td style="border-radius:9999px;background-color:#3F5A47;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none;letter-spacing:-0.4px;border-radius:9999px;background-color:#3F5A47;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function featureRow(icon, title, desc) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;width:100%;">
    <tr>
      <td width="32" valign="top" style="padding-right:12px;font-size:18px;">${icon}</td>
      <td>
        <p style="margin:0 0 2px;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:14px;font-weight:500;color:#1A1917;">${title}</p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;font-size:13px;color:#57554E;line-height:1.50;">${desc}</p>
      </td>
    </tr>
  </table>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

function verificationEmail(name, verifyUrl) {
  const content = `
    ${h1('Confirme seu endereço de e-mail')}
    ${p(`Olá, <strong>${name}</strong>!`)}
    ${p('Sua conta no GuardaApp foi criada com sucesso. Clique no botão abaixo para confirmar seu e-mail e ativar o acesso à plataforma.', true)}
    ${ctaButton('Verificar meu e-mail', verifyUrl)}
    ${note('Este link é válido por <strong>24 horas</strong>. Se você não criou uma conta no GuardaApp, pode ignorar este e-mail com segurança.')}
  `;
  return baseLayout({
    title: 'Ativação de conta',
    preheader: `${name}, confirme seu e-mail para ativar sua conta no GuardaApp.`,
    content,
  });
}

function welcomeEmail(name) {
  const content = `
    ${h1(`Bem-vindo ao GuardaApp, ${name}!`)}
    ${p('Sua conta foi verificada com sucesso. Estamos felizes em tê-lo aqui.')}
    ${divider()}
    ${p('<strong>O que você pode fazer agora:</strong>', true)}
    ${featureRow('📅', 'Calendário compartilhado', 'Organize visitas e compromissos dos filhos com seu co-parente.')}
    ${featureRow('💰', 'Despesas', 'Registre e compartilhe gastos com aprovação e rastreamento em tempo real.')}
    ${featureRow('💬', 'Mensagens', 'Comunicação documentada e segura com trilha de auditoria.')}
    ${featureRow('🗂️', 'Documentos', 'Armazene acordos, laudos e certidões em um só lugar.')}
    ${divider()}
    ${p('Para começar, convide seu co-parente pelo app e conecte-se.', true)}
    ${note('Dúvidas? Entre em contato pelo app ou acesse a central de ajuda.')}
  `;
  return baseLayout({
    title: 'Conta ativada',
    preheader: `Bem-vindo, ${name}! Sua conta foi ativada com sucesso.`,
    content,
  });
}

function passwordResetEmail(name, token) {
  const content = `
    ${h1('Redefinição de senha')}
    ${p(`Olá, <strong>${name}</strong>!`)}
    ${p('Recebemos uma solicitação para redefinir a senha da sua conta. Use o código abaixo no aplicativo para criar uma nova senha:', true)}
    ${codeBlock(token)}
    ${infoBox('Este código é válido por <strong>1 hora</strong>. Após esse prazo, será necessário solicitar um novo código.')}
    ${note('Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanece inalterada e sua conta está segura.')}
  `;
  return baseLayout({
    title: 'Redefinição de senha',
    preheader: `${name}, use o código para redefinir sua senha no GuardaApp.`,
    content,
  });
}

function inviteEmail(senderName, inviteCode, registerUrl) {
  const content = `
    ${h1(`${senderName} te convidou para o GuardaApp`)}
    ${p(`<strong>${senderName}</strong> está usando o GuardaApp para coordenar a co-parentalidade de forma organizada, segura e documentada.`)}
    ${p('Para aceitar o convite e conectar sua conta, use o código abaixo ao se cadastrar:', true)}
    ${codeBlock(inviteCode)}
    ${ctaButton('Criar minha conta', registerUrl)}
    ${divider()}
    ${p('O GuardaApp é uma plataforma segura para co-parentalidade que permite organizar calendários, compartilhar despesas, trocar mensagens documentadas e muito mais.', true)}
    ${note('Se você não esperava este convite ou não reconhece o remetente, pode ignorar este e-mail com segurança.')}
  `;
  return baseLayout({
    title: 'Convite de co-parentalidade',
    preheader: `${senderName} te convidou para o GuardaApp — plataforma de co-parentalidade.`,
    content,
  });
}

module.exports = { verificationEmail, welcomeEmail, passwordResetEmail, inviteEmail };
