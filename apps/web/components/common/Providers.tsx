'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === '/login') {
      setChecked(true);
      return;
    }

    try {
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('exprest_user') : null;
      if (!userStr) {
        router.push('/login');
      } else {
        const u = JSON.parse(userStr);
        if (u && u.isLoggedIn) {
          setChecked(true);
        } else {
          router.push('/login');
        }
      }
    } catch {
      router.push('/login');
    }
  }, [pathname, router]);

  if (!checked && pathname !== '/login') {
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
