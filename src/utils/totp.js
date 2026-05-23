/**
 * TOTP (RFC 6238) implementado com crypto nativo do Node.js
 * Substitui speakeasy sem dependência externa
 */
const crypto = require('crypto');

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = [];
  str = str.toUpperCase().replace(/=+$/, '');
  for (let i = 0; i < str.length; i++) {
    value = (value << 5) | alphabet.indexOf(str[i]);
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function generateSecret() {
  const bytes = crypto.randomBytes(20);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += alphabet[bytes[i] & 31];
  }
  return secret;
}

function hotp(secret, counter) {
  const key     = base32Decode(secret);
  const buf     = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac    = crypto.createHmac('sha1', key).update(buf).digest();
  const offset  = hmac[hmac.length - 1] & 0xf;
  const code    = ((hmac[offset] & 0x7f) << 24) |
                  ((hmac[offset + 1] & 0xff) << 16) |
                  ((hmac[offset + 2] & 0xff) << 8)  |
                   (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verify(secret, token, window = 1) {
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, step + i) === String(token).padStart(6, '0')) return true;
  }
  return false;
}

function otpauthUrl(secret, label, issuer = 'GuardaApp Admin') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, verify, otpauthUrl };
