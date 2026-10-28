-- ==============================================================================
-- EXPREST — Supabase Production Schema Verification Script (Read-Only)
-- Project Reference: zdudfwzeouvvexgaxmlv
-- Run in Supabase SQL Editor after running remediation migration
-- ==============================================================================

-- 1. Verify table exists
SELECT
  to_regclass('public.profiles') AS profiles_table,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AS table_exists;

-- 2. Verify Row Level Security is ENABLED (rls_enabled must be true)
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 3. Verify all 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
SELECT
  policyname,
  cmd,
  roles,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY cmd;

-- 4. Verify function definition: SECURITY DEFINER, search_path = ''
SELECT
  proname,
  prosecdef AS is_security_definer,
  proconfig AS function_config_search_path
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

-- 5. Verify execute privileges: PUBLIC should be FALSE, postgres/service_role TRUE
SELECT
  r.rolname AS role_name,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'handle_new_user'
  AND r.rolname IN ('public', 'anon', 'authenticated', 'postgres', 'service_role', 'supabase_auth_admin')
ORDER BY r.rolname;

-- 6. Verify trigger on auth.users is enabled (tgenabled = 'O')
SELECT
  tgname AS trigger_name,
  tgenabled AS trigger_enabled_status,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created';

-- 7. Verify profiles row count matches or accounts for users in auth.users
SELECT
  (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_count;
