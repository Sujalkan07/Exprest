'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    // Exempt /login and public share links from redirect
    if (pathname === '/login' || pathname.startsWith('/share/')) {
      setChecked(true);
      return;
    }

    let isMounted = true;

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!session) {
          router.push('/login');
        } else {
          setChecked(true);
        }
      } catch {
        if (!isMounted) return;
        router.push('/login');
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session && pathname !== '/login' && !pathname.startsWith('/share/')) {
        setChecked(false);
        router.push('/login');
      } else if (session) {
        setChecked(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  if (!checked && pathname !== '/login' && !pathname.startsWith('/share/')) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3 text-secondary text-sm font-body-sm">
        <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-sm animate-pulse">
          EX
        </div>
        <span>Authenticating session...</span>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 15,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        {children}
      </AuthGuard>
    </QueryClientProvider>
  );
}
