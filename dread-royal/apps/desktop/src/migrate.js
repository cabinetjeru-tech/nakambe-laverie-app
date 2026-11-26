// Applique les migrations Prisma (fichiers SQL) sans le moteur Prisma, en tenant à jour la table
// _prisma_migrations au format Prisma : la base reste compatible avec `prisma migrate deploy`
// si elle est un jour transférée sur un serveur.
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function ensureDatabase(adminUrl, db) {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (!r.rowCount) await c.query(`CREATE DATABASE "${db}" ENCODING 'UTF8'`);
  } finally { await c.end(); }
}

async function migrate(url, migrationsDir, log = console.log) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
    const done = new Set((await c.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map((r) => r.migration_name));
    const names = fs.readdirSync(migrationsDir).filter((d) => fs.existsSync(path.join(migrationsDir, d, 'migration.sql'))).sort();
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      log(`Migration ${name}…`);
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)', [crypto.randomUUID(), checksum, name]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Échec de la migration ${name} : ${e.message}`);
      }
    }
  } finally { await c.end(); }
}

module.exports = { ensureDatabase, migrate };
