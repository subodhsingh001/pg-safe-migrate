-- PostgreSQL 15+ features

MERGE INTO public.accounts AS target
USING public.account_import AS source
ON target.id = source.id
WHEN MATCHED THEN
    UPDATE SET email = source.email
WHEN NOT MATCHED THEN
    INSERT (id, email)
    VALUES (source.id, source.email);

CREATE UNIQUE INDEX accounts_email_unique
ON public.accounts (email) NULLS NOT DISTINCT;