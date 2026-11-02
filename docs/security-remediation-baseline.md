# Exprest Security Remediation Baseline & Audit

**Date:** 2026-11-02  
**Remediation Branch:** `security/comprehensive-remediation`  
**Base Commit:** `4a6154c0ae69695611ce65cdf326f5c315cb49d4`  
**Previous Security Hardening Commit:** `721a3fc`  

---

## 1. Executive Summary

This baseline audit document establishes the technical foundation before executing the comprehensive security hardening, functional bug fixes, and reliability improvements across the Exprest monorepo.

A full dry-run of the existing repository verification pipelines confirms that:
- Monorepo package dependencies install cleanly with frozen lockfile.
- Static type checking passes across all workspace packages (`@exprest/types`, `@exprest/config`, `@exprest/ui`, `@exprest/api`, `@exprest/web`).
- Frontend linting passes (`next lint` succeeded with 0 errors).
- All 224 existing automated backend tests pass across 12 test suites.
- Production builds succeed for both the Fastify API (`tsc`) and Next.js web application (`next build`).
- Production dependency vulnerability audit (`pnpm audit --prod`) reports zero known vulnerabilities.

However, detailed code inspection identified 8 critical functional logic defects, cryptographic truncation in share tokens, role validation gaps in JWT processing, and missing real database RLS integration tests.

---

## 2. Git History & Worktree Audit

- **Current Branch:** `security/comprehensive-remediation` (branched from `main` at `4a6154c`)
- **Latest Commit on `main`:** `4a6154c` (*fix(alternatives): simplify breadcrumbs to Home / Alternatives and remove passenger/budget badge chips*)
- **Commits Since Previous Security Hardening (`721a3fc`):**
  - `44b4870`: Added Alternative Journey Feature (Direct, Same-Train, and Connecting alternatives).
  - `ebf9a77`: GitHub Actions CI adjustments.
  - `e745ed7`: Alternative journey data integrity, date-awareness, and fallback elimination.
  - `4a6154c`: Breadcrumbs and chip styling updates.
- **Working Tree Cleanliness:** No untracked or uncommitted code files. Clean checkout verified.
- **Environment Files:** Local development `.env` and `.env.local` are strictly git-ignored and not tracked.

---

## 3. Baseline Verification Commands & Results

| Command | Status | Details |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | Lockfile synchronized, 6 workspace packages resolved in 2.6s |
| `pnpm -r run typecheck` | **PASS** | TypeScript compilation clean across all 6 packages (0 errors) |
| `pnpm -r run lint` | **PASS** | ESLint clean (0 errors, 2 minor layout font warnings) |
| `pnpm -r run test` | **PASS** | 224 passed, 0 failed, 69 suites in 22.3s |
| `pnpm -r run build` | **PASS** | Static and dynamic route builds compiled successfully |
| `pnpm audit --prod` | **PASS** | 0 vulnerabilities in production dependencies |
| `pnpm audit` (full) | **WARN** | 3 moderate vulnerabilities in dev-dependency `minimatch` via `eslint@8.57.1` |

---

## 4. Confirmed Defects & Implementation Scope

### Phase 1: Explicit JWT Role & Claims Enforcement
- **File:** `apps/api/src/common/middleware/auth.ts`
- **Defect:** `role: payload.role || 'authenticated'` permits tokens without a role or `service_role` tokens to be treated as ordinary authenticated users. Missing strict claim checks for `exp`, `nbf`, `iat`, `sub`, `iss`, `aud`, and `role`.
- **JWKS Hardening:** Statically configured JWKS does not enforce `MAX_JWKS_KEY_COUNT` or size bounds like remote JWKS. Unknown key IDs must be bounded against request storming.

### Phase 2: Seat Availability Classification Bug (HIGH)
- **File:** `apps/api/src/providers/railradar/RailRadarAdapter.ts` (`getSeatAvailability`)
- **Defect:** `rawStatus.includes('AVAILABLE')` executes before checking `NOT AVAILABLE` or `NOT-AVAILABLE`. A status of `"NOT AVAILABLE"` evaluates as `"AVAILABLE"` with `isAvailable: true`.
- **Correction:** Implement a robust `normalizeAvailabilityStatus()` checking negative statuses first, handling `AVAILABLE`, `RAC`, `WAITLISTED`, `UNAVAILABLE`, `UNKNOWN`, `NOT_CHECKED`.

### Phase 3 & 4: Connecting Journey Date & Overnight Arrival Date Bugs (HIGH)
- **File:** `apps/api/src/modules/journeys/AlternativeJourneyService.ts`
- **Defect:** Second leg query in connecting journeys drops the date parameter (`getTrainsBetween(junc.code, to, { byCity: false })`). Leg 1 arrival date and Leg 2 departure date are unconditionally assigned to `journeyDate`, ignoring overnight travel and day rollovers.
- **Correction:** Implement a railway date/time utility calculating accurate boarding calendar dates for connecting legs and overnight journeys based on departure time, arrival time, and layover.

### Phase 5: Strict Time Validation (MEDIUM)
- **File:** `apps/api/src/modules/journeys/AlternativeJourneyService.ts` (`isValidTimeString`)
- **Defect:** Regex `/^\d{1,2}:\d{2}$/` accepts invalid times like `25:90`, `24:00`, `99:99`, causing incorrect duration calculations and possible `NaN`.
- **Correction:** Strict numerical validation enforcing hours 00-23 and minutes 00-59.

### Phase 6: Journey Date Normalization (MEDIUM)
- **File:** `apps/api/src/providers/railradar/RailRadarAdapter.ts` (`normalizeFareDate`)
- **Defect:** Silently rewrites past dates to `todayIst`, masking historical date queries.
- **Correction:** Separate parsing from business validation; preserve requested dates; explicitly reject unsupported operations instead of silent substitution.

### Phase 7: Fare Calculation Reliability (MEDIUM)
- **File:** `apps/api/src/providers/railradar/RailRadarAdapter.ts` (`getTrainFare`)
- **Defect:** Arbitrary 800 km fallback used when distance is missing or when segment distance is unknown.
- **Correction:** Remove 800 km default; mark fares as `QUOTED`, `ESTIMATED`, or `UNAVAILABLE`; never present estimates as confirmed PRS fares.

### Phase 8: Same-Train Alternative Validation (MEDIUM)
- **File:** `apps/api/src/modules/journeys/AlternativeJourneyService.ts`
- **Correction:** Verify stop ordering (origin < boarding < destination), distance monotonicity, commercial rule 142 safeguards.

### Phase 9: Alternative Junction Discovery (MEDIUM)
- **File:** `apps/api/src/modules/journeys/AlternativeJourneyService.ts`
- **Defect:** Hardcoded `slice(0, 4)` selects fixed junctions (NGP, BPL, VGLJ, ET) regardless of geography.
- **Correction:** Select corridor-aware candidate junctions, cache timetables, apply concurrency controls.

### Phase 10: Share Token Hardening
- **File:** `apps/api/src/routes/index.ts`
- **Defect:** HMAC-SHA256 token truncated to 16 hex characters (64-bit entropy).
- **Correction:** Increase signature to >= 32 hex chars (128-bit); implement dual-verification to support legacy 16-char tokens during transition; add route-level rate limiting to share resolution.

### Phase 11: Secret Scanning & CI/CD Hardening
- **File:** `.github/workflows/ci.yml`
- **Defect:** Only checks root-level `.env` with grep.
- **Correction:** Implement Gitleaks scanning for git history and tree, audit check for dependencies, and pin actions.

### Phase 12: Supabase Database Security & RLS Integration Tests
- **Files:** `supabase/migrations/`
- **Defect:** Tests currently only use regex text checks on SQL files without executing real RLS isolation checks against two distinct test users.
- **Correction:** Provide idempotent migration verification and real integration test suite for cross-user isolation.

---

## 5. Security & Product Components to Preserve

1. **Authentication Architecture:** Supabase Auth, dual HS256/ES256 verification, JWKS key rotation, key caching, stale grace periods, in-flight request deduplication.
2. **Backend Architecture:** Fastify framework, Helmet, CORS origin controls, rate limiting, request correlation IDs, payload limits.
3. **Frontend Architecture:** Next.js App Router, dynamic CSP nonces, script-src hashes, open redirect protection, SSR cookie handling.
4. **Database:** Profiles table schema, RLS policies (`auth.uid() = id`), `handle_new_user` trigger with `SET search_path = ''`.
5. **Product Features:** Journey searches, train details, PNR status, alternative journeys, same-train alternatives, connecting alternatives, share links, saved journeys, weather telemetry, interactive map.
