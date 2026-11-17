-- Expected: PG001. This file is a demonstration, not a production migration.
CREATE INDEX idx_users_email ON users(email);
