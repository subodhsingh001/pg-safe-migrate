#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 -c 'CREATE TABLE users (id bigint PRIMARY KEY, email text);'
psql -v ON_ERROR_STOP=1 -c "INSERT INTO users VALUES (1, 'one@example.test');"
node bin/cli.js test/fixtures/prisma/migrations/202611170001_safe/migration.sql --fail-on error
node bin/cli.js test/fixtures/drizzle/0001_safe.sql --fail-on error
psql -v ON_ERROR_STOP=1 -f test/fixtures/prisma/migrations/202611170001_safe/migration.sql
psql -v ON_ERROR_STOP=1 -f test/fixtures/drizzle/0001_safe.sql
psql -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_email_idx'" | grep -qx '1'
psql -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active'" | grep -qx '1'
set +e
node bin/cli.js examples/unsafe.sql --fail-on error >/tmp/unsafe-lint.txt 2>&1
status=$?
set -e
cat /tmp/unsafe-lint.txt
if [ "$status" -ne 1 ]; then echo "Expected unsafe migration exit 1, got $status"; exit 1; fi
# Demonstrate PostgreSQL itself rejects CONCURRENTLY inside an explicit transaction.
set +e
psql -v ON_ERROR_STOP=1 -c 'BEGIN; CREATE INDEX CONCURRENTLY invalid_idx ON users(id); COMMIT;' >/tmp/tx-output.txt 2>&1
status=$?
set -e
if [ "$status" -eq 0 ]; then echo 'Expected PostgreSQL transaction rejection'; exit 1; fi
grep -qi 'cannot run inside a transaction block' /tmp/tx-output.txt
printf 'PostgreSQL %s integration passed\n' "$PG_MAJOR"
