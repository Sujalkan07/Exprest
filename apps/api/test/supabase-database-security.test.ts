import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Supabase Database Security & Migration Policy Suite', () => {
  // Resolve migrations dir whether running from root or apps/api package directory
  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'supabase/migrations'))
    ? process.cwd()
    : path.resolve(process.cwd(), '../..');

  const migrationsDir = path.resolve(rootDir, 'supabase/migrations');
  const migration001Path = path.join(migrationsDir, '001_create_profiles.sql');
  const migration002Path = path.join(migrationsDir, '002_harden_profile_functions.sql');
  const migration003Path = path.join(migrationsDir, '003_consolidated_profile_schema_remediation.sql');

  const migration001 = fs.readFileSync(migration001Path, 'utf-8');
  const migration002 = fs.readFileSync(migration002Path, 'utf-8');
  const migration003 = fs.readFileSync(migration003Path, 'utf-8');

  describe('1. Migration Sequence & File Integrity', () => {
    it('all three sequential migration files exist and are readable', () => {
      assert.ok(fs.existsSync(migration001Path), '001_create_profiles.sql must exist');
      assert.ok(fs.existsSync(migration002Path), '002_harden_profile_functions.sql must exist');
      assert.ok(fs.existsSync(migration003Path), '003_consolidated_profile_schema_remediation.sql must exist');
    });

    it('no database secrets or service-role keys are hardcoded in SQL files', () => {
      const allSql = `${migration001}\n${migration002}\n${migration003}`;
      assert.ok(!allSql.includes('eyJh'), 'JWT token must not be hardcoded in SQL');
      assert.ok(!allSql.includes('service_role_key'), 'Service role key placeholder must not be hardcoded in SQL');
      assert.ok(!/password\s*=\s*'[^']+'/i.test(allSql), 'Hardcoded database passwords must not exist in SQL');
    });
  });

  describe('2. Row Level Security (RLS) Configuration', () => {
    it('public.profiles explicitly enables Row Level Security in all migration scripts', () => {
      assert.ok(
        /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/i.test(migration001),
        'Migration 001 must enable RLS on public.profiles'
      );
      assert.ok(
        /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/i.test(migration003),
        'Consolidated Migration 003 must enable RLS on public.profiles'
      );
    });

    it('SELECT policy strictly isolates records to auth.uid() = id', () => {
      const policyRegex = /CREATE POLICY "Users can view own profile"\s+ON public\.profiles\s+FOR SELECT\s+USING \(auth\.uid\(\) = id\)/i;
      assert.ok(policyRegex.test(migration001), 'Migration 001 must restrict SELECT to auth.uid() = id');
      assert.ok(policyRegex.test(migration003), 'Migration 003 must restrict SELECT to auth.uid() = id');
    });

    it('INSERT policy strictly restricts new profile creation to authenticated user uid', () => {
      const policyRegex = /CREATE POLICY "Users can insert own profile"\s+ON public\.profiles\s+FOR INSERT\s+WITH CHECK \(auth\.uid\(\) = id\)/i;
      assert.ok(policyRegex.test(migration001), 'Migration 001 must restrict INSERT to auth.uid() = id');
      assert.ok(policyRegex.test(migration003), 'Migration 003 must restrict INSERT to auth.uid() = id');
    });

    it('UPDATE policy enforces both USING and WITH CHECK constraints preventing ownership modification', () => {
      // In Migration 002 and 003: Both USING and WITH CHECK must be present
      const hardenedUpdateRegex = /CREATE POLICY "Users can update own profile"\s+ON public\.profiles\s+FOR UPDATE\s+USING \(auth\.uid\(\) = id\)\s+WITH CHECK \(auth\.uid\(\) = id\)/i;
      assert.ok(hardenedUpdateRegex.test(migration002), 'Migration 002 must enforce USING and WITH CHECK on UPDATE');
      assert.ok(hardenedUpdateRegex.test(migration003), 'Migration 003 must enforce USING and WITH CHECK on UPDATE');
    });

    it('DELETE policy allows authenticated users to delete only their own profile record', () => {
      const deletePolicyRegex = /CREATE POLICY "Users can delete own profile"\s+ON public\.profiles\s+FOR DELETE\s+USING \(auth\.uid\(\) = id\)/i;
      assert.ok(deletePolicyRegex.test(migration002), 'Migration 002 must provide explicit user-scoped DELETE policy');
      assert.ok(deletePolicyRegex.test(migration003), 'Migration 003 must provide explicit user-scoped DELETE policy');
    });
  });

  describe('3. SECURITY DEFINER Search Path & Privilege Hardening', () => {
    it('handle_new_user() pins an explicit empty search_path', () => {
      // SET search_path = '' prevents search-path hijacking attacks in SECURITY DEFINER functions
      const searchPathRegex = /SECURITY DEFINER\s+SET search_path\s*=\s*''/i;
      assert.ok(searchPathRegex.test(migration002), 'Migration 002 handle_new_user must pin search_path = ""');
      assert.ok(searchPathRegex.test(migration003), 'Migration 003 handle_new_user must pin search_path = ""');
    });

    it('handle_new_user() fully qualifies system and schema functions', () => {
      const qualifiedRegex = /pg_catalog\.split_part/i;
      const qualifiedNow = /pg_catalog\.now\(\)/i;
      assert.ok(qualifiedRegex.test(migration002), 'Migration 002 must qualify pg_catalog.split_part');
      assert.ok(qualifiedNow.test(migration002), 'Migration 002 must qualify pg_catalog.now()');
      assert.ok(qualifiedRegex.test(migration003), 'Migration 003 must qualify pg_catalog.split_part');
      assert.ok(qualifiedNow.test(migration003), 'Migration 003 must qualify pg_catalog.now()');
    });

    it('handle_new_user() uses ON CONFLICT DO NOTHING for idempotent signup handling', () => {
      assert.ok(migration002.includes('ON CONFLICT (id) DO NOTHING'), 'Migration 002 must be idempotent on conflict');
      assert.ok(migration003.includes('ON CONFLICT (id) DO NOTHING'), 'Migration 003 must be idempotent on conflict');
    });

    it('execution privileges are revoked from PUBLIC and granted only to authorized service roles', () => {
      const revokeRegex = /REVOKE ALL ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC/i;
      const grantRegex = /GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO postgres, service_role/i;
      assert.ok(revokeRegex.test(migration002), 'Migration 002 must revoke execute from PUBLIC');
      assert.ok(grantRegex.test(migration002), 'Migration 002 must grant execute to postgres, service_role');
      assert.ok(revokeRegex.test(migration003), 'Migration 003 must revoke execute from PUBLIC');
      assert.ok(grantRegex.test(migration003), 'Migration 003 must grant execute to postgres, service_role');
    });
  });
});
