const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME || 'guardaapp',
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASSWORD || '',
  connectionLimit:    parseInt(process.env.DB_POOL_MAX) || 10,
  waitForConnections: true,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'UTF8MB4_UNICODE_CI',
});

// Garante utf8mb4 em toda conexão nova (necessário em alguns ambientes MySQL 8)
pool.pool.on('connection', (conn) => {
  conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci');
});

module.exports = pool;
