'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/common/TopBar';
import { TrainSearch } from '@/components/search/TrainSearch';
import Link from 'next/link';

interface RecentSearch {
  number: string;
  name: string;
  journeyId: string;
  date: string;
}

export default function HomePage() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('exprest_recent_searches');
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-surface-variant selection:text-primary">
      
      {/* ==================== TOP NAVIGATION BAR ==================== */}
      <header className="w-full bg-surface-container-lowest border-b border-border sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-space-lg max-w-7xl mx-auto h-14">
          <div className="flex items-center gap-space-md">
            <a className="font-heading-md text-[19px] font-bold text-on-surface tracking-tight flex items-center gap-2 transition-all duration-150 ease-out active:scale-95" href="#">
              <div className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>train</span>
              </div>
              <span>Exprest</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a className="text-on-surface-variant font-body-sm hover:text-primary hover:bg-surface transition-colors duration-150 py-1 px-2 rounded flex items-center gap-1.5" href="#saved">
              <span>Saved Trains</span>
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant">
                {recentSearches.length}
              </span>
            </a>
            <a className="text-primary font-semibold text-body-sm border-b-2 border-primary pb-1 flex items-center gap-1.5" href="#">
              <span>Live Radar</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
            </a>
            <a className="text-on-surface-variant font-body-sm hover:text-primary hover:bg-surface transition-colors duration-150 py-1 px-2 rounded flex items-center gap-1.5" href="#">
              <span>Status</span>
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-variant text-on-surface text-[11px] font-semibold transition-all duration-150 ease-out active:scale-95">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              <span>Live Feed</span>
            </button>
            <div className="hidden lg:flex items-center gap-1 px-2 py-1 rounded bg-surface border border-border text-on-secondary-container text-[11px] font-semibold">
              <span>⌘</span>
              <span>K</span>
            </div>
            <button aria-label="Notifications" className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface rounded-lg transition-colors duration-150">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </button>
            <button aria-label="Filter Tuning" className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface rounded-lg transition-colors duration-150">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================== MAIN CONTENT CANVAS ==================== */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col justify-start">
        <section className="w-full flex flex-col items-center text-center mt-2 mb-12">
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-lowest border border-border text-[11px] font-semibold text-on-surface-variant shadow-sm mb-6">
            <span className="inline-block w-2 h-2 rounded-full bg-success"></span>
            <span className="font-medium text-on-surface">Indian Railways Live Network</span>
            <span className="text-text-tertiary">|</span>
            <span>Freshness: 99.4%</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-on-surface-variant">12,480+ trains active</span>
          </div>

          <h1 className="text-[45px] leading-[52px] font-[650] text-on-surface tracking-tight max-w-2xl mb-3">
            Real-time train intelligence, simplified.
          </h1>
          <p className="text-[15px] leading-[22px] font-[450] text-secondary max-w-xl mb-8">
            Track exact positions, delays, platform numbers, and live route speed with zero noise.
          </p>

          <TrainSearch onSearchSelect={(train) => {
            const today = new Date().toISOString().split('T')[0];
            const journeyId = `journey_${train.number}_${today}`;
            const updated = [
              { number: train.number, name: train.name, journeyId, date: today },
              ...recentSearches.filter(r => r.number !== train.number)
            ].slice(0, 5);
            setRecentSearches(updated);
            try { localStorage.setItem('exprest_recent_searches', JSON.stringify(updated)); } catch {}
          }} />

        </section>

        {recentSearches.length > 0 && (
          <section className="w-full max-w-5xl mx-auto mb-12" id="saved">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                Recent Searches
              </span>
              <button 
                onClick={() => { setRecentSearches([]); localStorage.removeItem('exprest_recent_searches'); }}
                className="text-[11px] font-semibold text-text-tertiary hover:text-danger transition-colors duration-150 flex items-center gap-1"
              >
                <span>Clear history</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {recentSearches.map((s) => (
                <div key={s.journeyId} className="group inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-border hover:border-outline-variant transition-all duration-150 shadow-sm relative pr-8">
                  <Link href={`/journey/${s.journeyId}`} className="flex items-center gap-2.5">
                    <span className="text-[13px] font-medium text-on-surface">{s.number}</span>
                    <span className="text-secondary text-[13px] font-medium">{s.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success/10 text-success">
                      Live
                    </span>
                  </Link>
                  <button 
                    onClick={() => {
                      const updated = recentSearches.filter(r => r.journeyId !== s.journeyId);
                      setRecentSearches(updated);
                      localStorage.setItem('exprest_recent_searches', JSON.stringify(updated));
                    }}
                    className="absolute right-2 text-text-tertiary hover:text-on-surface opacity-0 group-hover:opacity-100 transition-opacity" 
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
