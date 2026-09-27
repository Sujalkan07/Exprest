'use client';

import React from 'react';
import { TopBar } from '@/components/common/TopBar';
import { StatusPill } from '@/components/common/StatusPill';

export default function SharedJourneyPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <TopBar />

      <main className="flex-1 mx-auto max-w-3xl w-full p-4 sm:p-6 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs text-text-secondary">
          Shared Journey Snapshot (Read-Only)
        </div>

        <div className="p-6 bg-surface-elevated border border-border rounded-card shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-black text-accent">12433</span>
              <h1 className="text-xl font-bold text-text">Rajdhani Express</h1>
              <p className="text-xs text-text-secondary mt-0.5">Chennai Central → New Delhi</p>
            </div>
            <StatusPill status="DELAYED" delayMinutes={12} />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <div className="text-xs text-text-tertiary">Current Station</div>
              <div className="font-bold text-text text-base">Vijayawada Junction</div>
              <div className="text-xs text-text-secondary">Departed 11:52 AM (+12m)</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Next Station</div>
              <div className="font-bold text-text text-base">Warangal</div>
              <div className="text-xs text-text-secondary">ETA 02:27 PM (142 km left)</div>
            </div>
          </div>

          <div className="w-full bg-surface h-2.5 rounded-pill overflow-hidden border border-border">
            <div className="bg-accent h-full rounded-pill" style={{ width: '70%' }} />
          </div>
          <div className="text-right text-[11px] text-text-tertiary">
            Updated 20 sec ago · Live telemetry subject to provider update cycles
          </div>
        </div>
      </main>
    </div>
  );
}
