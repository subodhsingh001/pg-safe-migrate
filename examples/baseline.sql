-- Example schema expected by examples/safe.sql and examples/unsafe.sql.
CREATE TABLE users (
  id bigint PRIMARY KEY,
  email text,
  name text
);
INSERT INTO users (id, email, name) VALUES (1, 'example@example.com', 'Example');
