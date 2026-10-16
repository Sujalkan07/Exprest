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
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid: SavedTrain[] = parsed
            .filter(
              (t): t is Record<string, any> =>
                Boolean(t && typeof t === 'object' && (t.number || t.trainNumber))
            )
            .map((t) => {
              const num = String(t.number || t.trainNumber || '');
              const date = typeof t.date === 'string' ? t.date : '';
              const journeyId =
                typeof t.journeyId === 'string' && t.journeyId
                  ? t.journeyId
                  : date
                  ? `journey_${num}_${date}`
                  : '';
              return {
                number: num,
                name: String(t.name || `Train ${num}`),
                journeyId,
                date: date || 'Recent',
              };
            });
          setSavedTrains(valid);
        } else {
          setSavedTrains([]);
        }
      }
    } catch {
      setSavedTrains([]);
    }
  }, []);

  const removeTrain = (stableId: string) => {
    const updated = savedTrains.filter((t, idx) => {
      const id = t.journeyId || `${t.number}_${t.date}_${idx}`;
      return id !== stableId;
    });
    setSavedTrains(updated);
    try {
      localStorage.setItem('exprest_recent_searches', JSON.stringify(updated));
    } catch {
      // Storage unavailable or quota exceeded
    }
  };

  // IST date: Asia/Kolkata timezone prevents UTC midnight boundary skew
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

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
            {savedTrains.map((train, idx) => {
              const stableId = train.journeyId || `${train.number}_${train.date}_${idx}`;
              const targetHref = train.journeyId
                ? `/journey/${train.journeyId}`
                : `/journey/journey_${train.number}_${
                    train.date && train.date !== 'Recent' ? train.date : today
                  }`;
              const isToday = train.date === today;

              return (
                <div
                  key={stableId}
                  className="p-4 bg-surface-elevated border border-border rounded-card shadow-sm flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-accent">{train.number}</span>
                      <span className="font-bold text-text">{train.name}</span>
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">
                      Service date: {train.date}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      href={targetHref}
                      className="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-control hover:bg-black transition-colors"
                    >
                      {isToday ? 'Track Today' : 'View Journey'}
                    </Link>
                    <button
                      onClick={() => removeTrain(stableId)}
                      className="text-xs text-text-tertiary hover:text-red-500 transition-colors px-2 py-1"
                      title="Remove from saved"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
