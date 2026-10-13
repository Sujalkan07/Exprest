export interface CorsEnv {
  NODE_ENV?: string;
  PUBLIC_APP_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

/**
 * Normalizes an origin string by stripping trailing slashes.
 * If a valid URL is provided, extracts its origin (scheme + domain + port).
 */
export function normalizeOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

/**
 * Resolves allowed CORS origins based on environment configuration.
 * - In development / test: Allows localhost and 127.0.0.1 across ports, plus PUBLIC_APP_URL.
 * - In production: Enforces a strict allowlist from PUBLIC_APP_URL and CORS_ALLOWED_ORIGINS.
 */
export function getCorsAllowedOrigins(env: CorsEnv = process.env): (string | RegExp)[] {
  const isProduction = env.NODE_ENV === 'production';

  if (!isProduction) {
    const devOrigins: (string | RegExp)[] = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    ];

    if (env.PUBLIC_APP_URL) {
      const normalized = normalizeOrigin(env.PUBLIC_APP_URL);
      if (normalized && !devOrigins.includes(normalized)) {
        devOrigins.push(normalized);
      }
    }

    if (env.CORS_ALLOWED_ORIGINS) {
      for (const origin of env.CORS_ALLOWED_ORIGINS.split(',')) {
        const normalized = normalizeOrigin(origin);
        if (normalized && !devOrigins.includes(normalized)) {
          devOrigins.push(normalized);
        }
      }
    }

    return devOrigins;
  }

  // Production: strictly allow explicit origins only
  const allowed = new Set<string>();

  if (env.PUBLIC_APP_URL) {
    const normalized = normalizeOrigin(env.PUBLIC_APP_URL);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  if (env.CORS_ALLOWED_ORIGINS) {
    for (const origin of env.CORS_ALLOWED_ORIGINS.split(',')) {
      const normalized = normalizeOrigin(origin);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  return Array.from(allowed);
}
