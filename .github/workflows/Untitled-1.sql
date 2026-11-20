-- PG Safe Migrate: advisory preview only; not an executable migration.
-- This preview is separate from your original SQL file.
-- Rule: PG025
-- 1. Review SQL dependencies.
-- 2. Test on staging.
-- 3. Deploy with lock and statement timeouts.
-- Raw SQL: verify the execution transaction policy. Guidance only; not validated against a live database.
-- Suggested approach: Validate a non-null invariant first

-- Replace identifiers. Backfill NULLs and prevent new NULLs first.
ALTER TABLE users ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_email_nn;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Caveat: SET NOT NULL can still require a strong lock. Check version, traffic, existing NULLs and constraint lifecycle.
-- Never execute this preview without reviewing and adapting it.