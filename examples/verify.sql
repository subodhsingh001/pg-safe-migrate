DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
    RAISE EXCEPTION 'users.phone missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_users_email') THEN
    RAISE EXCEPTION 'email index missing';
  END IF;
END $$;
