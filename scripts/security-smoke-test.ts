/**
 * Exprest Automated Security Smoke Testing Suite
 *
 * Executes automated security verification against an Exprest API instance (local or deployed).
 * Covers:
 *  1. Authentication & Token Verification (AuthN)
 *  2. Authorization & Data Isolation (AuthZ)
 *  3. Input Bounds & Injection Attacks
 *  4. Security Headers & Server Fingerprinting
 *  5. Rate Limiting Headers
 *  6. Error Sanitization & Secret Redaction
 *
 * Usage:
 *   npx tsx scripts/security-smoke-test.ts [TARGET_URL]
 *   Example: npx tsx scripts/security-smoke-test.ts http://localhost:4000
 */

import crypto from 'node:crypto';

const TARGET_URL = (process.argv[2] || process.env.TARGET_URL || 'http://localhost:4000').replace(/\/+$/, '');

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(category: string, name: string, passed: boolean, details?: string) {
  results.push({ category, name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${category}] ${name}${details ? ` (${details})` : ''}`);
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`  Exprest Automated Security Test Suite`);
  console.log(`  Target: ${TARGET_URL}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  // --- 1. Health & Server Fingerprinting ---
  console.log(`1. Testing Health & Server Fingerprinting...`);
  try {
    const res = await fetch(`${TARGET_URL}/health`);
    record('Headers', 'Health endpoint responds 200 OK', res.status === 200, `status: ${res.status}`);
    const poweredBy = res.headers.get('x-powered-by');
    record('Headers', 'X-Powered-By is hidden/absent', poweredBy === null, `value: ${poweredBy || 'none'}`);
  } catch (e: any) {
    record('Connectivity', 'Server reachable', false, e.message);
    console.error(`\nFailed to reach target server at ${TARGET_URL}. Ensure server is running.\n`);
    process.exit(1);
  }

  // --- 2. Security Headers on API Endpoints ---
  console.log(`\n2. Testing Security Headers...`);
  try {
    const res = await fetch(`${TARGET_URL}/api/v1/trains/search?q=12951`);
    const nosniff = res.headers.get('x-content-type-options');
    record('Headers', 'X-Content-Type-Options: nosniff present', nosniff === 'nosniff', `value: ${nosniff}`);

    // Rate limiting headers
    const rateLimit = res.headers.get('x-ratelimit-limit');
    const rateRemaining = res.headers.get('x-ratelimit-remaining');
    record(
      'RateLimit',
      'Rate limit headers present',
      Boolean(rateLimit && rateRemaining !== null),
      `limit: ${rateLimit}, remaining: ${rateRemaining}`
    );
  } catch (e: any) {
    record('Headers', 'Search endpoint headers test', false, e.message);
  }

  // --- 3. Authentication & Bearer Token Verification ---
  console.log(`\n3. Testing Authentication & Token Defenses (AuthN)...`);
  try {
    // Missing token
    const resMissing = await fetch(`${TARGET_URL}/api/v1/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ journeyId: '12951_2026-10-24' }),
    });
    record('AuthN', 'Missing Bearer token rejected with 401', resMissing.status === 401, `status: ${resMissing.status}`);

    // Non-JWT string
    const resInvalid = await fetch(`${TARGET_URL}/api/v1/shares`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer not-a-valid-jwt-token',
      },
      body: JSON.stringify({ journeyId: '12951_2026-10-24' }),
    });
    record('AuthN', 'Malformed token rejected with 401', resInvalid.status === 401, `status: ${resInvalid.status}`);

    // Algorithm 'none' attack token
    const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const fakePayload = Buffer.from(
      JSON.stringify({ sub: 'attacker-123', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const algNoneToken = `${algNoneHeader}.${fakePayload}.`;

    const resNone = await fetch(`${TARGET_URL}/api/v1/shares`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${algNoneToken}`,
      },
      body: JSON.stringify({ journeyId: '12951_2026-10-24' }),
    });
    record('AuthN', "Algorithm 'none' attack rejected with 401", resNone.status === 401, `status: ${resNone.status}`);

    // Expired token
    const expiredPayload = Buffer.from(
      JSON.stringify({ sub: 'user-expired', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) - 3600 })
    ).toString('base64url');
    const expiredToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${expiredPayload}.invalidsig`;
    const resExp = await fetch(`${TARGET_URL}/api/v1/shares`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ journeyId: '12951_2026-10-24' }),
    });
    record('AuthN', 'Expired token rejected with 401', resExp.status === 401, `status: ${resExp.status}`);
  } catch (e: any) {
    record('AuthN', 'Authentication verification suite', false, e.message);
  }

  // --- 4. Input Validation & Injection Attacks ---
  console.log(`\n4. Testing Input Bounds & Injection Defenses...`);
  try {
    // SQL injection payload in train number
    const sqliRes = await fetch(`${TARGET_URL}/api/v1/trains/%27%20OR%20%271%27%3D%271/live?date=2026-10-24`);
    record('InputBounds', 'SQL injection in train param rejected', sqliRes.status >= 400 && sqliRes.status < 500, `status: ${sqliRes.status}`);

    // Path traversal in train number
    const traversalRes = await fetch(`${TARGET_URL}/api/v1/trains/..%2F..%2Fetc%2Fpasswd/live?date=2026-10-24`);
    record('InputBounds', 'Path traversal in train param rejected', traversalRes.status >= 400 && traversalRes.status < 500, `status: ${traversalRes.status}`);

    // Invalid service date format
    const invalidDateRes = await fetch(`${TARGET_URL}/api/v1/trains/12951/live?date=invalid-date-format`);
    record('InputBounds', 'Invalid date format rejected', invalidDateRes.status >= 400 && invalidDateRes.status < 500, `status: ${invalidDateRes.status}`);

    // Oversized input string
    const oversizedQuery = 'A'.repeat(2000);
    const oversizedRes = await fetch(`${TARGET_URL}/api/v1/trains/search?q=${oversizedQuery}`);
    record('InputBounds', 'Oversized search query (>1000 chars) rejected with 400', oversizedRes.status === 400, `status: ${oversizedRes.status}`);
  } catch (e: any) {
    record('InputBounds', 'Input bounds validation', false, e.message);
  }

  // --- 5. Share Token Authorization & Cryptographic Bounds ---
  console.log(`\n5. Testing Share Links Cryptographic Tampering & Expiration...`);
  try {
    // Non-existent share token format
    const resNonExistent = await fetch(`${TARGET_URL}/api/v1/shares/sh_12951_2026-10-24_0000000000000000`);
    record('ShareSecurity', 'Non-existent / invalid HMAC share token returns 404', resNonExistent.status === 404, `status: ${resNonExistent.status}`);

    // Expired share token timestamp
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const resExpiredShare = await fetch(`${TARGET_URL}/api/v1/shares/sh_12951_2026-10-24_exp${expiredTimestamp}_0123456789abcdef`);
    record('ShareSecurity', 'Expired share token returns 404', resExpiredShare.status === 404, `status: ${resExpiredShare.status}`);

    // SQLi payload in share token
    const resSqliShare = await fetch(`${TARGET_URL}/api/v1/shares/sh_%27%20OR%201%3D1--`);
    record('ShareSecurity', 'Malformed share token syntax rejected (400/403/404)', [400, 403, 404].includes(resSqliShare.status), `status: ${resSqliShare.status}`);
  } catch (e: any) {
    record('ShareSecurity', 'Share security test suite', false, e.message);
  }

  // --- 6. Error Sanitization & Secret Redaction ---
  console.log(`\n6. Testing Error Sanitization & Information Leakage...`);
  try {
    const res = await fetch(`${TARGET_URL}/api/v1/non-existent-endpoint-for-error-testing`);
    const bodyText = await res.text();

    const leaksStack = bodyText.includes('at Object.') || bodyText.includes('at async') || bodyText.includes('node_modules');
    const leaksDb = bodyText.includes('postgres://') || bodyText.includes('postgresql://') || bodyText.includes('password');
    const leaksPath = bodyText.includes('C:\\') || bodyText.includes('/Users/') || bodyText.includes('/home/');

    record('ErrorSanitization', 'Error body does not leak stack traces', !leaksStack, leaksStack ? 'LEAKED' : 'safe');
    record('ErrorSanitization', 'Error body does not leak database strings', !leaksDb, leaksDb ? 'LEAKED' : 'safe');
    record('ErrorSanitization', 'Error body does not leak local filesystem paths', !leaksPath, leaksPath ? 'LEAKED' : 'safe');

    // Verify error JSON envelope
    let hasEnvelope = false;
    try {
      const json = JSON.parse(bodyText);
      hasEnvelope = Boolean(json.error && json.error.code && json.meta && json.meta.requestId);
    } catch {}
    record('ErrorSanitization', 'Structured error envelope { error, meta } enforced', hasEnvelope);
  } catch (e: any) {
    record('ErrorSanitization', 'Error sanitization check', false, e.message);
  }

  // --- Summary ---
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const totalCount = results.length;
  const passRate = Math.round((passedCount / totalCount) * 100);

  console.log(`\n======================================================`);
  console.log(`  Summary: ${passedCount}/${totalCount} tests passed (${passRate}%)`);
  if (failedCount === 0) {
    console.log(`  Status: ALL SECURITY SMOKE TESTS PASSED`);
  } else {
    console.log(`  Status: ${failedCount} FAILURES DETECTED`);
  }
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
