import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Allow public static assets, favicon, Next.js internal files
  if (
    pathname.startsWith('/_') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next({ request });
  }

  // 2. Dynamic cryptographically secure nonce generation for strict Content-Security-Policy
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isProd = process.env.NODE_ENV === 'production';
  const apiBaseOrigin = (() => {
    const url = process.env.NEXT_PUBLIC_API_URL;
    if (!url) return '';
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  })();

  const connectSources = isProd
    ? [
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://api.maptiler.com',
        'https://exprest.onrender.com',
        'https://exprest.vercel.app',
      ]
    : [
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://api.maptiler.com',
        'https://exprest.onrender.com',
        'http://localhost:4000',
        'http://127.0.0.1:4000',
        'http://localhost:3000',
      ];

  if (apiBaseOrigin && !connectSources.includes(apiBaseOrigin)) {
    connectSources.push(apiBaseOrigin);
  }

  // Exact SHA-256 hash of the inline theme script in layout.tsx:
  const themeScriptHash = "'sha256-Ux06g/fyaZ98M/rU9te9qnBRueRzYBYwGiqPVlfZ8mg='";

  // Strict CSP: In production, enforce nonces and exact hash with 'strict-dynamic' (NO 'unsafe-inline')
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' ${themeScriptHash}`
    : `'self' 'unsafe-eval' 'nonce-${nonce}' ${themeScriptHash} 'unsafe-inline'`;

  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' data: blob: https://api.maptiler.com;
    connect-src ${connectSources.join(' ')};
    worker-src 'self' blob:;
    child-src 'self' blob:;
    frame-ancestors 'none';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Forward nonce and CSP on request headers so Next.js App Router and Server Components can consume it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  supabaseResponse.headers.set('Content-Security-Policy', cspHeader);
  supabaseResponse.headers.set('x-nonce', nonce);

  // 3. Protected application routes requiring active Supabase authentication:
  // - /saved (saved journeys)
  // - /settings (user preferences and account)
  // Public application routes (/ , /journey/*, /pnr-status, /share/*, /login, /auth/callback)
  // are accessible to all users.
  const isProtectedRoute =
    pathname === '/saved' ||
    pathname.startsWith('/saved/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  if (isProd && (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co' || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'placeholder-anon-key')) {
    if (isProtectedRoute) {
      const loginUrl = new URL('/login?error=auth_unavailable', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      const redirectRes = NextResponse.redirect(loginUrl);
      redirectRes.headers.set('Content-Security-Policy', cspHeader);
      return redirectRes;
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        supabaseResponse.headers.set('Content-Security-Policy', cspHeader);
        supabaseResponse.headers.set('x-nonce', nonce);
      },
    },
  });

  // Verify real user session with Supabase auth
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  // Authoritative identity: strictly require validated Supabase authentication session
  const isAuthenticated = Boolean(user);

  // If already authenticated and visiting /login, redirect to destination or home
  if (pathname === '/login' && isAuthenticated) {
    const redirectTo = request.nextUrl.searchParams.get('redirectTo');
    const safePath =
      redirectTo &&
      redirectTo.startsWith('/') &&
      !redirectTo.startsWith('//') &&
      !redirectTo.includes(':') &&
      !redirectTo.includes('\\')
        ? redirectTo
        : '/';
    return NextResponse.redirect(new URL(safePath, request.url));
  }

  // If route is protected and user is NOT authenticated, redirect to /login
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/svg assets
     */
    '/((?!_next/static|_next/image|_not-found|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
