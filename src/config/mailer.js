'use strict';
const nodemailer = require('nodemailer');

const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

const transporter = nodemailer.createTransport(
  isDev
    ? {
        host: process.env.SMTP_HOST || 'mailhog',
        port: parseInt(process.env.SMTP_PORT) || 1025,
        secure: false,
        ignoreTLS: true,
      }
    : {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: parseInt(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }
);

module.exports = transporter;
