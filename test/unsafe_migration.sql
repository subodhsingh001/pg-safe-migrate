-- Unsafe migration triggering rules PG001 through PG006
CREATE INDEX idx_users_email ON users(email);

ALTER TABLE users DROP COLUMN legacy_token;

ALTER TABLE orders ALTER COLUMN total_amount TYPE BIGINT;

ALTER TABLE users ADD COLUMN organization_id INT NOT NULL;

ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE users RENAME COLUMN full_name TO display_name;
