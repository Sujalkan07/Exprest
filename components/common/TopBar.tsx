import React from 'react';
import Link from 'next/link';

export const TopBar: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-white font-bold text-sm">
            EX
          </div>
          <span className="text-lg font-bold tracking-tight text-text">Exprest</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/saved" className="text-text-secondary hover:text-text transition-colors">
            Saved
          </Link>
          <Link href="/settings" className="text-text-secondary hover:text-text transition-colors">
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
};
