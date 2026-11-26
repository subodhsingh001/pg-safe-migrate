ALTER TABLE public.users ALTER COLUMN id TYPE bigint;
CREATE INDEX users_id_idx ON public.users (id);
