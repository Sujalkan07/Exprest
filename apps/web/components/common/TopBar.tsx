'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DarkModeToggle } from './DarkModeToggle';
import { createClient } from '@/lib/supabase/client';

export const TopBar: React.FC = () => {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<{ name?: string; email?: string; isLoggedIn?: boolean } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
        setUser({ name, email: u.email || '', isLoggedIn: true });
      } else {
        setUser(null);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
        setUser({ name, email: u.email || '', isLoggedIn: true });
      } else {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-white font-bold text-sm">
            EX
          </div>
          <span className="text-lg font-bold tracking-tight text-text">Exprest</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/saved" className="text-text-secondary hover:text-text transition-colors">
            Saved
          </Link>
          <Link href="/settings" className="text-text-secondary hover:text-text transition-colors">
            Settings
          </Link>

          {/* Dark Mode Toggle */}
          <DarkModeToggle />

          {/* User Avatar / Sign In */}
          {user?.isLoggedIn ? (
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <button
                onClick={handleSignOut}
                title="Sign Out"
                className="flex items-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xs ring-2 ring-transparent group-hover:ring-accent/30 transition-all">
                  {user.name ? user.name[0].toUpperCase() : 'U'}
                </div>
              </button>
              <button
                onClick={handleSignOut}
                className="hidden sm:block px-2.5 py-1 rounded-full border border-border bg-surface hover:bg-surface-elevated text-text-secondary text-xs font-medium transition-all"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-full bg-accent text-white text-xs font-semibold hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 border-l border-border pl-3 ml-1"
            >
              <span className="material-symbols-outlined text-[16px]">account_circle</span>
              <span>Sign In</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
