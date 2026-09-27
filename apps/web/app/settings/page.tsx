'use client';

import React, { useState } from 'react';
import { TopBar } from '@/components/common/TopBar';

export default function SettingsPage() {
  const [theme, setTheme] = useState('light');
  const [reducedMotion, setReducedMotion] = useState(false);

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
                  onClick={() => setTheme(t)}
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
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
