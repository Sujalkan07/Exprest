'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/common/TopBar';

export default function SettingsPage() {
  const [theme, setTheme] = useState('system');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // 1. Read persisted theme
    const storedTheme = localStorage.getItem('exprest_theme');
    const storedDark = localStorage.getItem('exprest_dark');
    const initialTheme =
      storedTheme ||
      (storedDark !== null ? (storedDark === 'true' ? 'dark' : 'light') : 'system');
    setTheme(initialTheme);

    // Apply theme to document
    const applyTheme = (t: string) => {
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (t === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      }
    };
    applyTheme(initialTheme);

    // Listen to operating system theme changes when in system mode
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const currentStored = localStorage.getItem('exprest_theme') || 'system';
      if (currentStored === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    darkMedia.addEventListener('change', handleSystemThemeChange);

    // 2. Read persisted reduced motion
    const storedMotion = localStorage.getItem('exprest_reduced_motion');
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const initialMotion =
      storedMotion !== null ? storedMotion === 'true' : motionMedia.matches;
    setReducedMotion(initialMotion);
    document.documentElement.setAttribute('data-reduced-motion', String(initialMotion));

    // Listen to operating system reduced-motion changes when no explicit override is set
    const handleSystemMotionChange = (e: MediaQueryListEvent) => {
      const currentStored = localStorage.getItem('exprest_reduced_motion');
      if (currentStored === null) {
        setReducedMotion(e.matches);
        document.documentElement.setAttribute('data-reduced-motion', String(e.matches));
      }
    };
    motionMedia.addEventListener('change', handleSystemMotionChange);

    return () => {
      darkMedia.removeEventListener('change', handleSystemThemeChange);
      motionMedia.removeEventListener('change', handleSystemMotionChange);
    };
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
      // System mode
      localStorage.removeItem('exprest_dark');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
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
        <h1 className="text-2xl font-bold text-text">Preferences &amp; Settings</h1>

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
              <p className="text-xs text-text-secondary">
                Disable map marker smooth interpolation &amp; route glow animation.
              </p>
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
