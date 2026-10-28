-- Supabase Database Schema Migration: Harden Profile Functions and RLS Policies
-- Migration: 002_harden_profile_functions.sql
-- Addresses:
--   HIGH-02: Pin explicit empty search_path for SECURITY DEFINER handle_new_user()
--   INFO-01: Explicit user-scoped DELETE policy for public.profiles
--   INFO-02: Explicit WITH CHECK clause on UPDATE policy for public.profiles

-- 1. Replace handle_new_user() with an explicit, secure search_path
-- Using SET search_path = '' ensures no unqualified objects or search-path hijacking can occur.
-- All system functions and tables are fully schema-qualified.
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

-- Restrict function execution permissions: only postgres, service_role, and supabase auth service need execute
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role, supabase_auth_admin;

-- 2. Harden UPDATE policy on public.profiles with an explicit WITH CHECK constraint (INFO-02)
-- Guarantees authenticated users can never alter the ownership identifier (id) of a profile row.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Explicit user-scoped DELETE policy on public.profiles (INFO-01)
-- Allows authenticated users to safely delete their own profile record independently of auth cascade.
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);
