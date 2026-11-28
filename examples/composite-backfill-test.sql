WITH batch AS (
    SELECT s."tenant_id", s."order_id"
    FROM "public"."customer_orders" AS s
    WHERE s."email_address" IS DISTINCT FROM s."email"
    ORDER BY s."tenant_id", s."order_id"
    LIMIT 1000
    FOR UPDATE OF s SKIP LOCKED
)
UPDATE "public"."customer_orders" AS u
SET "email_address" = u."email"
FROM batch AS b
WHERE u."tenant_id" = b."tenant_id"
  AND u."order_id" = b."order_id"
  AND u."email_address" IS DISTINCT FROM u."email";