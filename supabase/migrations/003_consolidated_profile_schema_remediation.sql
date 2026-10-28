-- ==============================================================================
-- EXPREST — Consolidated Supabase Profile Schema Remediation
-- Project Reference: zdudfwzeouvvexgaxmlv
-- File: supabase/migrations/003_consolidated_profile_schema_remediation.sql
-- ==============================================================================
-- Combines Migration 001 (table & trigger creation) and Migration 002 (security
-- hardening) into a single, transactional, idempotent remediation script.
--
-- Safe to execute in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zdudfwzeouvvexgaxmlv/sql
-- ==============================================================================

BEGIN;

-- 1. Create public.profiles table linked to auth.users with cascade delete
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Idempotent user-scoped RLS policies
-- SELECT: Users can only read their own profile row
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- INSERT: Users can only insert a profile row matching their authenticated uid
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: Hardened with both USING and WITH CHECK to prevent ownership modification
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: Explicit user-scoped delete policy
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

-- 4. Hardened signup trigger function:
--    - SECURITY DEFINER (runs with table owner privileges)
--    - SET search_path = '' (pins empty search_path to eliminate search-path injection)
--    - Fully qualified schema references (pg_catalog, public)
--    - ON CONFLICT (id) DO NOTHING (prevents duplicate key errors on retries)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      pg_catalog.split_part(new.email, '@', 1)
    ),
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. Restrict function execution permissions:
--    - Revoke all privileges from PUBLIC role
--    - Grant execute only to postgres, service_role, and supabase_auth_admin
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin';
  END IF;
END $$;

-- 6. Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Backfill existing users in auth.users who signed up before profiles existed
INSERT INTO public.profiles (id, full_name, created_at, updated_at)
SELECT
  id,
  COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    pg_catalog.split_part(email, '@', 1)
  ),
  created_at,
  pg_catalog.now()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 8. Record applied migrations in supabase_migrations if migration tracking table exists


COMMIT;
