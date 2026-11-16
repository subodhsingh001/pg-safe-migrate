-- Safe zero-downtime migration
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

ALTER TABLE users ADD COLUMN organization_id INT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
