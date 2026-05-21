'use strict';
/**
 * Socket.IO — bootstrap e autenticação
 *
 * - Inicializa o Server acoplado ao httpServer do Express
 * - Middleware de handshake: valida JWT e resolve connectionId
 * - Rooms: connectionId (conversa) + user:<userId> (multi-dispositivo)
 * - Exporta getIO() para serviços emitirem fora do contexto de socket
 */

const { Server }       = require('socket.io');
const { verifyAccess } = require('../config/jwt');
const coparentService  = require('../services/coparentService');
const registerMessageHandlers = require('./messageHandlers');

let io = null;

/**
 * Inicializa o Socket.IO acoplado ao servidor HTTP do Express.
 * Deve ser chamado UMA vez em server.js antes do server.listen().
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.WS_CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    // Mantém conexões abertas por até 60s sem ping
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── Middleware de autenticação no handshake ──────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Token pode vir de socket.handshake.auth.token (preferencial pelo cliente RN)
      // ou do header Authorization (fallback)
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) return next(new Error('UNAUTHORIZED'));

      const payload = verifyAccess(token);

      // Resolve conexão de co-parentalidade ativa
      const conn = await coparentService.getConnectionForUser(payload.userId);
      if (!conn) return next(new Error('NO_CONNECTION'));

      socket.data.userId       = payload.userId;
      socket.data.sessionId    = payload.sessionId || null;
      socket.data.connectionId = conn.id;
      socket.data.connection   = conn; // objeto completo (tem protective_order)

      next();
    } catch (err) {
      // Inclui erros de JWT expirado/inválido
      next(new Error('UNAUTHORIZED'));
    }
  });

  // ── Conexão estabelecida ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { userId, connectionId } = socket.data;

    // Room de conversa (ambos os participantes)
    socket.join(connectionId);
    // Room pessoal (multi-dispositivo — remetente vê ticks em todos os aparelhos)
    socket.join(`user:${userId}`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[WS] Conectado: user=${userId} conn=${connectionId} sid=${socket.id}`);
    }

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[WS] Desconectado: user=${userId} reason=${reason}`);
      }
    });

    // Registra handlers de eventos de mensagem
    registerMessageHandlers(io, socket);
  });

  return io;
}

/**
 * Retorna a instância do Socket.IO.
 * Lança erro se initSocket() ainda não foi chamado.
 */
function getIO() {
  if (!io) throw new Error('[Socket] getIO() chamado antes de initSocket()');
  return io;
}

module.exports = { initSocket, getIO };
