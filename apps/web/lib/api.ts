/**
 * Centralized API client and configuration for @exprest/web
 */

/**
 * Resolves the API base URL based on runtime environment.
 * In local dev (localhost/127.0.0.1), defaults to 'http://localhost:4000'.
 * In production browser when NEXT_PUBLIC_API_URL is omitted, defaults to '' (relative path),
 * routing through Next.js rewrites to prevent ERR_CONNECTION_REFUSED to client localhost.
 */
export function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:4000' : '';
  }

  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://exprest.onrender.com' : 'http://localhost:4000')
  ).replace(/\/+$/, '');
}

export const API_BASE = getApiBase();

/**
 * Standard fetch wrapper with timeout, signal abortion, and error handling.
 */
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const baseUrl = getApiBase();
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const controller = new AbortController();
  const onCallerAbort = () => {
    controller.abort((fetchOptions.signal as any)?.reason);
  };

  if (fetchOptions.signal) {
    if (fetchOptions.signal.aborted) {
      controller.abort((fetchOptions.signal as any)?.reason);
    } else {
      fetchOptions.signal.addEventListener('abort', onCallerAbort);
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`API request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!res.ok) {
      let errorBody: any;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { message: res.statusText || `HTTP ${res.status}` };
      }
      const message = errorBody?.error?.message || errorBody?.message || `Request failed with status ${res.status}`;
      const err = new Error(message);
      (err as any).status = res.status;
      (err as any).data = errorBody;
      throw err;
    }

    return await res.json();
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      if (fetchOptions.signal?.aborted) {
        throw err;
      }
      throw new Error(`API request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (fetchOptions.signal) {
      fetchOptions.signal.removeEventListener('abort', onCallerAbort);
    }
  }
}
