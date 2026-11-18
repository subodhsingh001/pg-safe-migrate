-- Expected: PG021, PG022, PG023, PG024, PG025.
ALTER TABLE public.accounts ADD COLUMN nonce double precision DEFAULT random();
ALTER TABLE public.audit_events SET LOGGED;
TRUNCATE TABLE public.staging_accounts;
ALTER TABLE public.accounts DROP CONSTRAINT accounts_email_key;
ALTER TABLE public.accounts ALTER COLUMN email SET NOT NULL;
