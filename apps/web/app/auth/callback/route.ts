import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = requestUrl.searchParams.get('redirectTo') || '/';

  // Open redirect protection: ensure internal path only
  const safeRedirect =
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('//') &&
    !redirectTo.includes(':') &&
    !redirectTo.includes('\\')
      ? redirectTo
      : '/';

  if (code) {
    const isProd = process.env.NODE_ENV === 'production';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (isProd && (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co' || !supabaseAnonKey || supabaseAnonKey === 'placeholder-anon-key')) {
      return NextResponse.redirect(new URL('/login?error=auth_unavailable', request.url));
    }

    const effectiveUrl = supabaseUrl || 'https://placeholder.supabase.co';
    const effectiveAnonKey = supabaseAnonKey || 'placeholder-anon-key';
    const cookieStore = await cookies();

    const supabase = createServerClient(effectiveUrl, effectiveAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored if called from route handlers
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeRedirect, request.url));
    }
  }

  // If exchange fails, redirect to login with error parameter
  return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
}
