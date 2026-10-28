-- ==============================================================================
-- EXPREST — Supabase Production Schema Diagnostic Queries (Read-Only)
-- Project Reference: zdudfwzeouvvexgaxmlv
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/zdudfwzeouvvexgaxmlv/sql
-- ==============================================================================

-- 1. Check if public.profiles exists
SELECT
  to_regclass('public.profiles') AS profiles_table,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AS table_exists;

-- 2. Inspect columns of public.profiles if it exists
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Check Row Level Security (RLS) status on public.profiles
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 4. Check existing policies on public.profiles
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 5. Check if public.handle_new_user() exists, SECURITY DEFINER, and search_path
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS definition,
  p.prosecdef AS is_security_definer,
  p.proconfig AS function_config_search_path
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

-- 6. Check function execution permissions (PUBLIC vs administrative roles)
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'handle_new_user'
  AND r.rolname IN ('public', 'anon', 'authenticated', 'postgres', 'service_role', 'supabase_auth_admin')
ORDER BY r.rolname;

-- 7. Check if on_auth_user_created trigger exists on auth.users
SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  n.nspname AS schema_name,
  t.tgenabled AS trigger_enabled,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created';

-- 8. Check Supabase migration history status
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_name LIKE '%migration%'
ORDER BY table_name;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations table exists';
  END IF;
END $$;
