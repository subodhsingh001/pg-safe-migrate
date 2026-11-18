-- Safe expansion: metadata-only nullable column, followed by a stable default.
ALTER TABLE public.accounts ADD COLUMN nickname text;
ALTER TABLE public.accounts ADD COLUMN created_at timestamptz DEFAULT now();
CREATE INDEX CONCURRENTLY accounts_nickname_idx ON public.accounts (nickname);
