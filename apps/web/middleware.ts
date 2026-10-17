import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // 1. Allow public static assets, favicon, Next.js internal files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return supabaseResponse;
  }

  // 2. Protected application routes requiring active Supabase authentication:
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

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
