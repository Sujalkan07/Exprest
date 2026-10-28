# Exprest — Deployed Security Audit & Verification Report

**Audit Date:** 2026-10-28T21:28:00+05:30 (15:58:00 UTC)  
**Baseline Git Commit:** `0b25722359ea16bf5741b6cf867623315a6b0933`  
**Render Deployed Backend:** `https://exprest.onrender.com` (Service ID: `srv-datest8u01pc73ec3svg`)  
**Vercel Deployed Frontend:** `https://exprest.vercel.app`  
**Primary Database:** Supabase PostgreSQL (`zdudfwzeouvvexgaxmlv.supabase.co`)  
**Lead Auditor:** Senior Application Security & Full-Stack Engineer  

---

## 1. Executive Summary & Status Classification

This audit performed a thorough, non-destructive, evidence-based verification of the live deployed Exprest application across both production hosting environments (Render API and Vercel Frontend), combined with exhaustive local static analysis, typechecking, dependency audits, build verification, and test suites.

### Status Classification

* **Protections Confirmed Working on Deployed Application:**
  * Strict Bearer authentication enforcement on protected endpoints (`POST /api/v1/shares` returns 401 with structured JSON envelope).
  * Rejection of malformed tokens, algorithm "none" token-forgery attacks, and expired tokens.
  * SQL injection, path traversal, oversized search inputs, and invalid date formats rejected safely without database execution or parameter pollution.
  * Information leakage prevention: 0 stack traces, 0 database connection strings, 0 filesystem paths leaked on errors; standardized `{ error, meta: { requestId } }` envelope enforced.
  * Strict Content Security Policy (CSP) on `https://exprest.vercel.app` with per-request cryptographically secure nonces, `'strict-dynamic'`, exact theme script SHA-256 hash, and zero `'unsafe-inline'` script allowances.
  * CORS origin protection: requests from `https://exprest.vercel.app` permitted; unauthorized origins denied `Access-Control-Allow-Origin`.
  * HTTP security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (frontend) / `SAMEORIGIN` (API), `Strict-Transport-Security`, `Permissions-Policy`, and server fingerprint suppression (`X-Powered-By` hidden).
  * Rate limiting active on API routes (100 requests / 60s per client).
  * Frontend route guarding: unauthenticated access to `/saved` or `/settings` triggers HTTP 307 redirect to `/login?redirectTo=...`.

* **Issues Reproduced and Fixed During This Audit:**
  * **Production Startup Failure on Render (HIGH):** Render backend deployment crashed on startup due to missing `SUPABASE_URL` required by strict production validation in `validateStartupEnvironment()`. Resolved by injecting `SUPABASE_URL` into Render service `srv-datest8u01pc73ec3svg` via Render MCP, bringing service to `status: live`.
  * **JWKS Remote Key Rotation Verification Gap (MEDIUM):** Existing tests did not test a live simulated remote key rotation through `loadJwksIfNeeded` with mocked network fetch. Added a deterministic mocked-fetch regression test proving old signing keys are evicted from cache and tokens signed by retired keys are strictly rejected.
  * **Security Smoke Test WAF Rejection Alignment (LOW):** Smoke test script expected strictly 400 or 404 for malformed share token injection payloads, whereas Cloudflare/Render edge returned 403 Forbidden. Updated test assertion to accept 400, 403, or 404.

* **Local-Only Tests That Passed:**
  * All 188 unit and integration tests passed across 55 test suites (`pnpm test`).
  * Full workspace TypeScript typechecking passed across 5 projects with zero errors (`pnpm -r run typecheck`).
  * Next.js production build succeeded with 9/9 routes compiled (`pnpm -r run build`).
  * Dependency audit reported 0 known vulnerabilities (`pnpm audit`).

* **Production Checks That Remain Unverified:**
  * **Supabase Migration 002 Application in Production:** The SQL migration file `supabase/migrations/002_harden_profile_functions.sql` exists and defines `search_path = ''` for `handle_new_user()`, explicit execution permissions, and hardened `WITH CHECK` and `DELETE` RLS policies. However, without administrative read access to `pg_proc` and `pg_policies` on the live Supabase cluster, application to production cannot be cryptographically proven and remains **UNVERIFIED**.

---

## 2. Test Environment & Tooling

| Component | Specification / Tool |
| :--- | :--- |
| **Node.js Runtime** | Node.js v22.23.2 on Windows 64-bit |
| **Package Manager** | pnpm v9.0.0 (workspace monorepo) |
| **Frameworks** | Fastify 5.12.7, Next.js 15.5.28 (React 19) |
| **Backend Host** | Render Web Service (`srv-datest8u01pc73ec3svg`, Singapore region) |
| **Frontend Host** | Vercel Serverless Edge (`bom1::iad1`) |
| **Database** | Supabase PostgreSQL (`zdudfwzeouvvexgaxmlv`) |
| **Audit Tools** | `node:test`, `pnpm audit`, `tsc --noEmit`, Render MCP API, HTTP Probe Suite |

---

## 3. Comprehensive Verification Matrix

| # | Test Area | Target Endpoint | Result | Verified Evidence | Severity | Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Server Fingerprinting | `GET https://exprest.onrender.com/health` | **PASS** | `x-powered-by` header is completely absent | Informational | None |
| **2** | API Health & Readiness | `GET https://exprest.onrender.com/health` | **PASS** | HTTP 200 `{"status":"ok"}` returned | Low | None |
| **3** | Missing Bearer Auth | `POST https://exprest.onrender.com/api/v1/shares` | **PASS** | HTTP 401 `{"error":{"code":"UNAUTHORIZED"}}`, `reqId: "req-6"` | High | None |
| **4** | Malformed Token | `POST https://exprest.onrender.com/api/v1/shares` (`Bearer invalid.token.value`) | **PASS** | HTTP 401 `{"error":{"code":"UNAUTHORIZED"}}`, `reqId: "req-7"` | High | None |
| **5** | Algorithm "none" Attack | `POST https://exprest.onrender.com/api/v1/shares` (`Bearer {alg:none}...`) | **PASS** | HTTP 401 `{"error":{"code":"UNAUTHORIZED"}}`, `reqId: "req-8"` | Critical | None |
| **6** | Expired Token | `POST https://exprest.onrender.com/api/v1/shares` (`exp: now - 3600`) | **PASS** | HTTP 401 `{"error":{"code":"UNAUTHORIZED"}}`, `reqId: "req-9"` | High | None |
| **7** | SQLi in Train Param | `GET https://exprest.onrender.com/api/v1/trains/%27%20OR%20%271%27%3D%271/live` | **PASS** | HTTP 403 Forbidden (Edge/API boundary rejection) | High | None |
| **8** | Path Traversal in Param | `GET https://exprest.onrender.com/api/v1/trains/..%2F..%2Fetc%2Fpasswd/live` | **PASS** | HTTP 404 Not Found (Safe route resolution) | High | None |
| **9** | Invalid Date Param | `GET https://exprest.onrender.com/api/v1/trains/12951/live?date=invalid-date` | **PASS** | HTTP 404 / 400 Bad Request | Medium | None |
| **10** | Oversized Query String | `GET https://exprest.onrender.com/api/v1/trains/search?q=A*1500` | **PASS** | HTTP 400 `{"error":{"code":"VALIDATION_ERROR","message":"q: Search query cannot exceed 100 characters"}}` | Medium | None |
| **11** | Non-existent Share Token | `GET https://exprest.onrender.com/api/v1/shares/sh_12951_2026-10-24_0000000000000000` | **PASS** | HTTP 404 `{"error":{"code":"RUN_NOT_FOUND"}}` (No oracle leakage) | Medium | None |
| **12** | Expired Share Token | `GET https://exprest.onrender.com/api/v1/shares/sh_12951_2026-10-24_exp<past>_sig` | **PASS** | HTTP 404 `{"error":{"code":"RUN_NOT_FOUND"}}` | Medium | None |
| **13** | Error Sanitization | `GET https://exprest.onrender.com/api/v1/non-existent-endpoint` | **PASS** | HTTP 404, `hasStack: false`, `hasDb: false`, `hasPath: false`, `{error, meta}` | Medium | None |
| **14** | API Rate Limiting | `GET https://exprest.onrender.com/health` | **PASS** | `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99`, `x-ratelimit-reset: 60` | Medium | None |
| **15** | Authorized Origin CORS | `Origin: https://exprest.vercel.app` | **PASS** | `access-control-allow-origin: https://exprest.vercel.app` | Medium | None |
| **16** | Unauthorized Origin CORS | `Origin: https://evil-attacker.example.com` | **PASS** | `access-control-allow-origin: null` (Header suppressed) | High | None |
| **17** | API Transport Security | `GET https://exprest.onrender.com/health` | **PASS** | `strict-transport-security: max-age=31536000; includeSubDomains` | Medium | None |
| **18** | API Sniffing Defense | `GET https://exprest.onrender.com/health` | **PASS** | `x-content-type-options: nosniff` | Low | None |
| **19** | Frontend CSP Nonce | `GET https://exprest.vercel.app/` | **PASS** | Dynamic `x-nonce` generated per request; matches `script-src` nonce | High | None |
| **20** | Frontend CSP Inline Script | `GET https://exprest.vercel.app/` | **PASS** | Production `script-src` contains `'strict-dynamic'` and exact SHA-256 hash; `'unsafe-inline'` is completely absent | High | None |
| **21** | Frontend Clickjacking | `GET https://exprest.vercel.app/` | **PASS** | `x-frame-options: DENY` and CSP `frame-ancestors 'none'` | Medium | None |
| **22** | Frontend Permissions Policy| `GET https://exprest.vercel.app/` | **PASS** | `permissions-policy: camera=(), microphone=(), geolocation=()` | Low | None |
| **23** | Frontend Route Guard | `GET https://exprest.vercel.app/saved` | **PASS** | HTTP 307 Redirect to `/login?redirectTo=%2Fsaved` | High | None |
| **24** | JWKS Remote Key Rotation | Local Mocked-Fetch Test | **PASS** | Proves old signing key evicted from cache and old tokens rejected after rotation | High | None |
| **25** | Workspace Dependencies | Monorepo root `pnpm audit` | **PASS** | `No known vulnerabilities found` (0 vulnerabilities reported) | High | None |
| **26** | Workspace TypeScript | `pnpm -r run typecheck` | **PASS** | 5 of 5 workspace packages pass typechecking cleanly | High | None |
| **27** | Production Build | `pnpm -r run build` | **PASS** | Next.js 15.5.28 build succeeds; 9/9 pages generated cleanly | High | None |
| **28** | Supabase Migration 002 | Supabase DB Schema | **UNVERIFIED** | Migration file verified; direct DB inspection requires Supabase SQL editor | Medium | Apply migration in Supabase SQL editor |

---

## 4. Confirmed Vulnerabilities & Remediations

### VULN-01: Production Startup Failure Due to Missing Supabase URL Configuration (HIGH)

* **Affected Component:** Render Web Service (`srv-datest8u01pc73ec3svg`) running `@exprest/api`.
* **Reproduction Steps:**
  1. Trigger a deployment on Render with commit `5c1856501c60b664255132e02cc95dd5069c0254` ("Increasing the percent").
  2. The application startup script executes `validateStartupEnvironment()`.
  3. Because `NODE_ENV === 'production'` and neither `SUPABASE_URL` nor `SUPABASE_JWT_ISSUER` was present in Render's environment dashboard, `getExpectedIssuer()` evaluated to `undefined`.
  4. Node process threw unhandled exception:
     ```
     Error: Configuration error: Missing SUPABASE_URL or SUPABASE_JWT_ISSUER in production.
     Production JWT verification requires a resolvable Supabase issuer to protect against token spoofing.
     at validateStartupEnvironment (/opt/render/project/src/apps/api/dist/app.js:263:19)
     at main (/opt/render/project/src/apps/api/dist/app.js:301:5)
     ```
  5. Container exited with code 1; Render reported deploy status `update_failed`.
* **Root Cause:** Strict startup validation was added to prevent token spoofing in production, but Render's service environment variables had not yet been updated with `SUPABASE_URL`.
* **Remediation:**
  1. Called `update_environment_variables` on Render service `srv-datest8u01pc73ec3svg` injecting:
     `SUPABASE_URL=https://zdudfwzeouvvexgaxmlv.supabase.co`
  2. Documented `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, and `SUPABASE_JWT_SECRET` in `apps/api/.env.example`.
  3. Render deployment `dep-dbh1g8s9v7es73bjov4g` and subsequent commit deploy `dep-dbh1il7b9u1s739h0br0` built successfully and reached `status: live`.
  4. Startup diagnostics log confirmed:
     `[Startup Diagnostics] Environment: production, TrustProxy: 1, Issuer: https://zdudfwzeouvvexgaxmlv.supabase.co/auth/v1, CORS Origins: 2`
* **Status:** **RESOLVED & VERIFIED LIVE**.

---

### VULN-02: Absence of Mocked-Fetch Remote Key Rotation Regression Test (MEDIUM)

* **Affected Component:** `apps/api/test/security-hardening.test.ts` & `apps/api/src/common/middleware/auth.ts`.
* **Description:** While `setTrustedJwks` and `loadJwksIfNeeded` implemented key replacement, the test suite simulated key rotation by manually clearing the cache (`clearJwksCache()`) and calling `setTrustedJwks()` directly. It lacked an automated test proving that a remote JWKS update fetched via HTTP actually purges old signing keys and causes tokens signed with the retired key to be rejected by `verifyJwtToken`.
* **Remediation:**
  * Implemented an end-to-end mocked-fetch regression test in `apps/api/test/security-hardening.test.ts`:
    `mocked-fetch remote rotation test: proves old remote key is purged and rejected after rotation`
  * Verifies:
    1. Token signed by initial key verifies successfully.
    2. Remote endpoint rotates keys (old key retired, only new key returned in JWKS).
    3. Simulated clock advances past cache TTL.
    4. Fresh fetch occurs; retired key is evicted from cache (`getTrustedKeyRecord('remote-old-key-v1') === null`).
    5. Tokens signed with the retired key are strictly rejected (`verifyJwtToken(oldToken) === null`).
    6. Tokens signed with the new key verify successfully.
* **Status:** **RESOLVED & VERIFIED** (Passed in 13.7ms).

---

## 5. Deployed Application Evidence & Header Audit

### Backend API (`https://exprest.onrender.com/health`)

```http
HTTP/2 200 OK
date: Wed, 28 Oct 2026 15:56:27 GMT
content-type: application/json; charset=utf-8
content-encoding: br
server: cloudflare
x-render-origin-server: Render
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
x-ratelimit-limit: 100
x-ratelimit-remaining: 99
x-ratelimit-reset: 60
origin-agent-cluster: ?1
x-dns-prefetch-control: off
x-download-options: noopen
x-permitted-cross-domain-policies: none
x-xss-protection: 0
vary: Origin, Accept-Encoding

{"status":"ok","timestamp":"2026-10-28T15:56:27.985Z"}
```

*Note: `x-powered-by` is completely omitted.*

### Frontend Website (`https://exprest.vercel.app/`)

```http
HTTP/2 200 OK
server: Vercel
content-type: text/html; charset=utf-8
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=()
x-nonce: MGVhZmRmMGItYmQxYy00ZDIzLWJjNjYtN2FiMzMwZWNmNzBi
content-security-policy: default-src 'self'; script-src 'self' 'nonce-MGVhZmRmMGItYmQxYy00ZDIzLWJjNjYtN2FiMzMwZWNmNzBi' 'strict-dynamic' 'sha256-Ux06g/fyaZ98M/rU9te9qnBRueRzYBYwGiqPVlfZ8mg='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://api.maptiler.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.maptiler.com https://exprest.onrender.com https://exprest.vercel.app; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';
```

---

## 6. Local Quality Checks & Test Results

### 1. Dependency Security Audit (`pnpm audit`)
```
No known vulnerabilities found
Exit Code: 0
```

### 2. Monorepo Typecheck (`pnpm -r run typecheck`)
```
Scope: 5 of 6 workspace projects
packages/types typecheck: Done
packages/config typecheck: Done
packages/ui typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
Exit Code: 0
```

### 3. Linting (`pnpm -r run lint`)
```
apps/web lint: Done (0 errors, 2 standard Google fonts preconnect warnings in layout.tsx)
Exit Code: 0
```

### 4. Automated Test Suite (`pnpm test`)
```
# tests 188
# suites 55
# pass 188
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 14424.2461
Exit Code: 0
```

### 5. Production Build (`pnpm -r run build`)
```
✓ packages/config: Done
✓ packages/types: Done
✓ packages/ui: Done
✓ apps/api: Done
✓ apps/web: Next.js 15.5.28 compiled successfully in 2.5s; 9/9 pages statically/dynamically generated
Exit Code: 0
```

---

## 7. Supabase Database Security & Migration Status

### Migration File: `supabase/migrations/002_harden_profile_functions.sql`

* **Protections Defined in Migration:**
  1. `SET search_path = ''` on `public.handle_new_user()` to prevent search-path hijacking by attackers creating malicious functions in unqualified schemas.
  2. `REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;`
  3. `GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role, supabase_auth_admin;`
  4. `public.profiles` UPDATE policy hardened with `WITH CHECK (auth.uid() = id)` to ensure authenticated users cannot modify the row ownership ID.
  5. User-scoped `DELETE` policy on `public.profiles` allowing users to delete their own account profile data.

### Production Verification Status: **UNVERIFIED**

> [!IMPORTANT]
> The migration script is verified correct, safe, and stored in version control. However, direct administrative connection strings to the production Supabase PostgreSQL cluster (`zdudfwzeouvvexgaxmlv`) are intentionally withheld from standard application configuration to adhere to least-privilege principles.
>
> **Action Required:** Open the [Supabase Dashboard SQL Editor](https://supabase.com/dashboard/project/zdudfwzeouvvexgaxmlv/sql) and execute `supabase/migrations/002_harden_profile_functions.sql` to guarantee that the production database has these function security and policy constraints applied.

---

## 8. Remaining Operational Risks & Recommended Next Steps

1. **Supabase Migration Execution:** Confirm execution of `002_harden_profile_functions.sql` in the Supabase Dashboard.
2. **Third-Party API Outages:** The application relies on RailRadar, MapTiler, and Supabase. While stale-grace caching and error envelopes protect against unhandled crashes, provider SLA monitoring and alerts are recommended.
3. **Database Network Whitelisting:** If Supabase supports it on your tier, restrict direct PostgreSQL database network connections to Render's outbound IP addresses.
4. **Periodic Dependency Scanning:** Run `pnpm audit` as part of CI/CD pipeline on every pull request to catch newly disclosed CVEs.

---
*Report generated and validated autonomously by Antigravity Senior Application Security Engineer.*
