'use client';

import React, { useEffect, useState } from 'react';

export const DarkModeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(false);

  // On mount, read persisted preference and apply it
  useEffect(() => {
    const stored = localStorage.getItem('exprest_dark');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enabled = stored === 'true' || (stored === null && prefersDark);
    if (enabled) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('exprest_dark', String(next));
    setIsDark(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface transition-colors text-text-secondary hover:text-text"
    >
      <span className="material-symbols-outlined text-[20px]">
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  );
};
