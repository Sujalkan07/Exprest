'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/common/TopBar';
import Link from 'next/link';

interface SavedTrain {
  number: string;
  name: string;
  journeyId: string;
  date: string;
}

export default function SavedPage() {
  const [savedTrains, setSavedTrains] = useState<SavedTrain[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('exprest_recent_searches');
      if (stored) {
        setSavedTrains(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const removeTrain = (number: string) => {
    const updated = savedTrains.filter(t => t.number !== number);
    setSavedTrains(updated);
    try { localStorage.setItem('exprest_recent_searches', JSON.stringify(updated)); } catch {}
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <TopBar />

      <main className="flex-1 mx-auto max-w-4xl w-full p-4 sm:p-6 space-y-6">
        <h1 className="text-2xl font-bold text-text">Recent &amp; Saved Trains</h1>

        {savedTrains.length === 0 ? (
          <div className="p-12 bg-surface-elevated border border-border rounded-card text-center text-text-secondary">
            <div className="text-4xl mb-4">🚆</div>
            <p className="font-semibold">No saved trains yet.</p>
            <p className="text-sm mt-1">Search for a train on the home page to get started.</p>
            <Link
              href="/"
              className="inline-block mt-6 px-5 py-2.5 bg-accent text-white font-semibold rounded-control text-sm hover:bg-black transition-colors"
            >
              Search Trains
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {savedTrains.map((train) => (
              <div key={train.number} className="p-4 bg-surface-elevated border border-border rounded-card shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-accent">{train.number}</span>
                    <span className="font-bold text-text">{train.name}</span>
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">Last searched: {train.date}</div>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/journey/journey_${train.number}_${today}`}
                    className="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-control hover:bg-black transition-colors"
                  >
                    Track Today
                  </Link>
                  <button
                    onClick={() => removeTrain(train.number)}
                    className="text-xs text-text-tertiary hover:text-red-500 transition-colors px-2 py-1"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
