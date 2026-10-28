import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
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

  return createBrowserClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key'
  );
}
