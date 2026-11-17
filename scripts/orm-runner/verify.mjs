
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'Set DATABASE_URL to a disposable PostgreSQL database.'
  );
}

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe-orm-'));

const prismaSchema = `orm_test_prisma_${process.pid}`;
const drizzleSchema = `orm_test_drizzle_${process.pid}`;

const quote = (value) =>
  '"' + value.replaceAll('"', '""') + '"';

const pool = new pg.Pool({
  connectionString: url
});

function exec(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}`
    );
  }
}

function cleanupTemporaryDirectory() {
  try {
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500
    });
  } catch (error) {
    console.warn(
      `Warning: Could not remove temporary directory: ${root}`
    );
    console.warn(error.message);
  }
}

async function verify() {
  let prismaSchemaCreated = false;
  let drizzleSchemaCreated = false;

  try {
    // 1. Create isolated test schemas.
    await pool.query(
      `CREATE SCHEMA ${quote(prismaSchema)}`
    );
    prismaSchemaCreated = true;

    await pool.query(
      `CREATE SCHEMA ${quote(drizzleSchema)}`
    );
    drizzleSchemaCreated = true;

    // 2. Prepare Prisma migrations.
    const prismaUrl = new URL(url);
    prismaUrl.searchParams.set('schema', prismaSchema);

    const prismaDir = path.join(root, 'prisma');
    const prismaMigrationsDir = path.join(
      prismaDir,
      'migrations'
    );

    const prismaMigrationDir = path.join(
      prismaMigrationsDir,
      '202611170001_baseline'
    );

    fs.mkdirSync(prismaMigrationDir, {
      recursive: true
    });

    const prismaSchemaFile = path.join(
      prismaDir,
      'schema.prisma'
    );

    fs.writeFileSync(
      prismaSchemaFile,
      `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`
    );

    fs.writeFileSync(
      path.join(
        prismaMigrationsDir,
        'migration_lock.toml'
      ),
      'provider = "postgresql"\n'
    );

    // Prisma migration 1: create the table.
    fs.writeFileSync(
      path.join(prismaMigrationDir, 'migration.sql'),
      `CREATE TABLE orm_prisma_users (
  id bigint PRIMARY KEY,
  email text
);
`
    );

    // Prisma migration 2: create the index separately.
    const prismaIndexMigrationDir = path.join(
      prismaMigrationsDir,
      '202611170002_concurrent_index'
    );

    fs.mkdirSync(prismaIndexMigrationDir, {
      recursive: true
    });

    fs.writeFileSync(
      path.join(prismaIndexMigrationDir, 'migration.sql'),
      `CREATE INDEX CONCURRENTLY orm_prisma_users_email_idx
ON orm_prisma_users (email);
`
    );

    // 3. Run the actual Prisma CLI using Node.js.
    const prismaCli = path.join(
      runnerDir,
      'node_modules',
      'prisma',
      'build',
      'index.js'
    );

    if (!fs.existsSync(prismaCli)) {
      throw new Error(
        `Prisma CLI not found: ${prismaCli}. Run npm install in scripts/orm-runner.`
      );
    }

    console.log('\nRunning Prisma migrate deploy...');

    exec(
      process.execPath,
      [
        prismaCli,
        'migrate',
        'deploy',
        '--schema',
        prismaSchemaFile
      ],
      {
        ...process.env,
        DATABASE_URL: prismaUrl.toString()
      }
    );

    // 4. Verify Prisma table and concurrent index.
    const prismaResult = await pool.query(
      'SELECT to_regclass($1) AS name',
      [`${prismaSchema}.orm_prisma_users`]
    );

    if (!prismaResult.rows[0].name) {
      throw new Error(
        'Prisma migration did not create its table.'
      );
    }

    console.log('PASS: Prisma baseline migration.');

    const prismaIndex = await pool.query(
      'SELECT to_regclass($1) AS name',
      [`${prismaSchema}.orm_prisma_users_email_idx`]
    );

    if (!prismaIndex.rows[0].name) {
      throw new Error(
        'Prisma concurrent index was not created.'
      );
    }

    console.log('PASS: Prisma concurrent index created.');

    // 5. Prepare Drizzle migration.
    const drizzleFolder = path.join(root, 'drizzle');
    const drizzleMetaFolder = path.join(
      drizzleFolder,
      'meta'
    );

    fs.mkdirSync(drizzleMetaFolder, {
      recursive: true
    });

    fs.writeFileSync(
      path.join(drizzleFolder, '0000_baseline.sql'),
      `CREATE TABLE ${quote(drizzleSchema)}.orm_drizzle_users (
  id bigint PRIMARY KEY,
  email text
);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY orm_drizzle_users_email_idx
ON ${quote(drizzleSchema)}.orm_drizzle_users (email);
`
    );

    fs.writeFileSync(
      path.join(drizzleMetaFolder, '_journal.json'),
      JSON.stringify(
        {
          version: '7',
          dialect: 'postgresql',
          entries: [
            {
              idx: 0,
              version: '7',
              when: 1760000000000,
              tag: '0000_baseline',
              breakpoints: true
            }
          ]
        },
        null,
        2
      )
    );

    // 6. Verify Drizzle's transaction restriction.
    console.log(
      '\nTesting Drizzle concurrent-index restriction...'
    );

    const db = drizzle(pool);

    let drizzleRejectedConcurrentIndex = false;

    try {
      await migrate(db, {
        migrationsFolder: drizzleFolder,
        migrationsSchema: drizzleSchema,
        migrationsTable: '__drizzle_migrations'
      });
    } catch (error) {
      // Drizzle wraps the underlying PostgreSQL error.
      let cause = error;

      while (cause?.cause) {
        cause = cause.cause;
      }

      if (cause?.code === '25001') {
        drizzleRejectedConcurrentIndex = true;

        console.log(
          'PASS: Drizzle migrator rejected CREATE INDEX CONCURRENTLY inside a transaction (PostgreSQL 25001).'
        );
      } else {
        throw error;
      }
    }

    if (!drizzleRejectedConcurrentIndex) {
      throw new Error(
        'Expected Drizzle migrator to reject the concurrent-index migration, but it succeeded.'
      );
    }

    // 7. Confirm the rejected migration did not create the index.
    const drizzleIndex = await pool.query(
      'SELECT to_regclass($1) AS name',
      [`${drizzleSchema}.orm_drizzle_users_email_idx`]
    );

    if (drizzleIndex.rows[0].name) {
      throw new Error(
        'Drizzle concurrent index unexpectedly exists after migration rejection.'
      );
    }

    console.log(
      'PASS: No Drizzle concurrent index was created.'
    );

    console.log(
      '\nAll ORM migration verification checks passed.'
    );

    console.log(
      'Prisma: standalone concurrent-index migration succeeded.'
    );

    console.log(
      'Drizzle: concurrent-index migration was correctly rejected.'
    );

    if (process.env.KEEP_TEST_SCHEMAS === '1') {
      console.log(
        `Test schemas retained for inspection: ${prismaSchema}, ${drizzleSchema}`
      );
    }
  } finally {
    try {
      if (process.env.KEEP_TEST_SCHEMAS !== '1') {
        if (prismaSchemaCreated) {
          await pool.query(
            `DROP SCHEMA IF EXISTS ${quote(prismaSchema)} CASCADE`
          );
        }

        if (drizzleSchemaCreated) {
          await pool.query(
            `DROP SCHEMA IF EXISTS ${quote(drizzleSchema)} CASCADE`
          );
        }

        console.log(
          'Temporary database schemas cleaned up.'
        );
      }
    } finally {
      try {
        await pool.end();
      } finally {
        cleanupTemporaryDirectory();
      }
    }
  }
}

await verify();
