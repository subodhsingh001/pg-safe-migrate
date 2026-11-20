CREATE INDEX idx_users_email ON users(email);
ALTER TABLE users DROP COLUMN phone;