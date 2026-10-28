import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isProd) {
    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co' || !supabaseUrl.startsWith('https://')) {
      throw new Error('Configuration error: Missing or invalid NEXT_PUBLIC_SUPABASE_URL in production environment.');
    }
    if (!supabaseAnonKey || supabaseAnonKey === 'placeholder-anon-key' || supabaseAnonKey.length < 20) {
      throw new Error('Configuration error: Missing or invalid NEXT_PUBLIC_SUPABASE_ANON_KEY in production environment.');
    }
  }

  return createServerClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored if called from Server Components
          }
        },
      },
    }
  );
}
