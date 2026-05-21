/**
 * migrate.js — Runner de migrations para o GuardaApp
 *
 * Cria a tabela `schema_migrations` se não existir.
 * Lê todos os arquivos *.sql em /migrations, ordena pelo nome,
 * e aplica apenas os que ainda não foram registrados.
 * Idempotente: rodar duas vezes não re-aplica migrations já aplicadas.
 *
 * Uso: npm run migrate
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

async function run() {
  const conn = await mysql.createConnection({
    host:     DB_HOST,
    port:     parseInt(DB_PORT),
    database: DB_NAME,
    user:     DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true, // necessário para executar vários statements por arquivo
  });

  console.log(`[migrate] Conectado ao banco ${DB_NAME}@${DB_HOST}:${DB_PORT}`);

  // Garante tabela de controle
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INT           NOT NULL AUTO_INCREMENT,
      filename   VARCHAR(255)  NOT NULL UNIQUE,
      applied_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Lê migrations já aplicadas
  const [applied] = await conn.execute(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  const appliedSet = new Set(applied.map(r => r.filename));

  // Lista arquivos .sql ordenados
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[migrate] Ignorado (já aplicado): ${file}`);
      continue;
    }

    console.log(`[migrate] Aplicando: ${file} ...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await conn.query(sql);
      await conn.execute(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [file]
      );
      console.log(`[migrate] ✓ ${file}`);
      count++;
    } catch (err) {
      console.error(`[migrate] ✗ ERRO em ${file}:`, err.message);
      await conn.end();
      process.exit(1);
    }
  }

  console.log(`[migrate] Concluído. ${count} migration(s) aplicada(s).`);
  await conn.end();
}

run().catch(err => {
  console.error('[migrate] Falha fatal:', err.message);
  process.exit(1);
});
