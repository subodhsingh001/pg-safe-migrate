CREATE INDEX CONCURRENTLY idx_customers_email
ON customers(email);
ALTER TABLE users DROP COLUMN phone;