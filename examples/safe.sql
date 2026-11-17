-- This avoids PG001; execute outside a transaction.
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
