TRUNCATE TABLE customers;

ALTER TABLE users
ALTER COLUMN email SET NOT NULL;

ALTER TABLE orders
DROP CONSTRAINT orders_customer_id_fkey;