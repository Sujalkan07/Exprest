'use client';

import React, { useState } from 'react';
import { TopBar } from '@/components/common/TopBar';

export default function SettingsPage() {
  const [theme, setTheme] = useState('system');
  const [reducedMotion, setReducedMotion] = useState(false);

  React.useEffect(() => {
    // Read persisted theme
    const storedTheme = localStorage.getItem('exprest_theme');
    const storedDark = localStorage.getItem('exprest_dark');
    if (storedTheme) {
      setTheme(storedTheme);
    } else if (storedDark !== null) {
      setTheme(storedDark === 'true' ? 'dark' : 'light');
    }

    // Read persisted reduced motion
    const storedMotion = localStorage.getItem('exprest_reduced_motion');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMotionReduced = storedMotion !== null ? storedMotion === 'true' : prefersReducedMotion;
    setReducedMotion(isMotionReduced);
  }, []);

  const handleThemeChange = (selectedTheme: string) => {
    setTheme(selectedTheme);
    localStorage.setItem('exprest_theme', selectedTheme);

    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('exprest_dark', 'true');
    } else if (selectedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('exprest_dark', 'false');
    } else {
      // System
      localStorage.removeItem('exprest_dark');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const handleMotionChange = (checked: boolean) => {
    setReducedMotion(checked);
    localStorage.setItem('exprest_reduced_motion', String(checked));
    document.documentElement.setAttribute('data-reduced-motion', String(checked));
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <TopBar />

      <main className="flex-1 mx-auto max-w-2xl w-full p-4 sm:p-6 space-y-6">
        <h1 className="text-2xl font-bold text-text">Preferences & Settings</h1>

        <div className="p-6 bg-surface-elevated border border-border rounded-card shadow-sm space-y-6">
          <div>
            <h2 className="text-sm font-bold text-text mb-2">Theme</h2>
            <div className="flex gap-3">
              {['light', 'system', 'dark'].map((t) => (
                <button
                  key={t}
                  onClick={() => handleThemeChange(t)}
                  className={`px-4 py-2 text-xs font-semibold rounded-control capitalize border transition-colors ${
                    theme === t
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface text-text-secondary border-border hover:text-text'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text">Reduced Motion</h2>
              <p className="text-xs text-text-secondary">Disable map marker smooth interpolation & route glow animation.</p>
            </div>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => handleMotionChange(e.target.checked)}
              className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
