import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL to a disposable PostgreSQL database.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe-orm-'));
const prismaSchema = 'pg_safe_prisma_' + process.pid;
const drizzleSchema = 'pg_safe_drizzle_' + process.pid;
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const pool = new pg.Pool({ connectionString: url });

function exec(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

try {
  await pool.query(`CREATE SCHEMA ${quote(prismaSchema)}`);
  await pool.query(`CREATE SCHEMA ${quote(drizzleSchema)}`);
  const prismaUrl = new URL(url);
  prismaUrl.searchParams.set('schema', prismaSchema);
  const prismaDir = path.join(root, 'prisma');
  const migrations = path.join(prismaDir, 'migrations', '202611170001_baseline');
  fs.mkdirSync(migrations, { recursive: true });
  fs.writeFileSync(path.join(prismaDir, 'schema.prisma'), `datasource db { provider = "postgresql"\n url = env("DATABASE_URL") }\ngenerator client { provider = "prisma-client-js" }\n`);
  fs.writeFileSync(path.join(prismaDir, 'migrations', 'migration_lock.toml'), 'provider = "postgresql"\n');
  fs.writeFileSync(path.join(migrations, 'migration.sql'), 'CREATE TABLE orm_prisma_users (id bigint PRIMARY KEY);\n');
  const prismaCli = path.resolve('node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  exec(prismaCli, ['migrate', 'deploy', '--schema', path.join(prismaDir, 'schema.prisma')], { ...process.env, DATABASE_URL: prismaUrl.toString() });
  const prismaResult = await pool.query('SELECT to_regclass($1) AS name', [`${prismaSchema}.orm_prisma_users`]);
  if (!prismaResult.rows[0].name) throw new Error('Prisma migration did not create its table');

  const drizzleFolder = path.join(root, 'drizzle');
  fs.mkdirSync(path.join(drizzleFolder, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(drizzleFolder, '0000_baseline.sql'), `CREATE TABLE ${quote(drizzleSchema)}.orm_drizzle_users (id bigint PRIMARY KEY);\n`);
  fs.writeFileSync(path.join(drizzleFolder, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'postgresql', entries: [{ idx: 0, version: '7', when: 1760000000000, tag: '0000_baseline', breakpoints: true }] }));
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: drizzleFolder, migrationsSchema: drizzleSchema, migrationsTable: '__drizzle_migrations' });
  const drizzleResult = await pool.query('SELECT to_regclass($1) AS name', [`${drizzleSchema}.orm_drizzle_users`]);
  if (!drizzleResult.rows[0].name) throw new Error('Drizzle migration did not create its table');
  console.log('Actual Prisma migrate deploy and Drizzle ORM migrator baseline checks passed.');
  console.log(`Test schemas retained for inspection: ${prismaSchema}, ${drizzleSchema}`);
} finally {
  await pool.end();
  fs.rmSync(root, { recursive: true, force: true });
}
