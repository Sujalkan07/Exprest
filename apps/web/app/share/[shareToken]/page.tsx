'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/common/TopBar';
import { StatusPill } from '@/components/common/StatusPill';

import { API_BASE } from '@/lib/api';

export default function SharedJourneyPage() {
  const params = useParams();
  const shareToken = params.shareToken as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['sharedJourney', shareToken],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/shares/${encodeURIComponent(shareToken)}`);
      if (!res.ok) throw new Error('Shared journey not found');
      return res.json();
    },
  });

  const journey = data?.data;
  const train = journey?.train;
  const run = journey?.run;
  const progress = journey?.progress;
  const currentStop = journey?.stops?.[progress?.currentStopIdx ?? 0];
  const nextStop = progress?.nextStopIdx !== -1 && progress?.nextStopIdx != null
    ? journey?.stops?.[progress.nextStopIdx]
    : null;

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <TopBar />

      <main className="flex-1 mx-auto max-w-3xl w-full p-4 sm:p-6 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs text-text-secondary">
          Shared Journey Snapshot (Read-Only)
        </div>

        {isLoading && (
          <div className="p-8 text-center text-text-secondary text-sm animate-pulse">
            Loading shared journey snapshot…
          </div>
        )}

        {(error || !journey) && !isLoading && (
          <div className="p-8 bg-surface-elevated border border-border rounded-card text-center space-y-2">
            <h2 className="text-base font-bold text-text">Shared Journey Unavailable</h2>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              This shared link could not be resolved. Note that custom short tokens require database persistence to be configured.
            </p>
          </div>
        )}

        {journey && (
          <div className="p-6 bg-surface-elevated border border-border rounded-card shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-black text-accent">{train?.number || '—'}</span>
                <h1 className="text-xl font-bold text-text">{train?.name || 'Train Details'}</h1>
                <p className="text-xs text-text-secondary mt-0.5">
                  {train?.originStationName || train?.originStationId || 'Origin'} → {train?.destinationStationName || train?.destinationStationId || 'Destination'}
                </p>
              </div>
              <StatusPill status={run?.status || 'RUNNING'} delayMinutes={run?.delayMinutes || 0} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-text-tertiary">Current Station</div>
                <div className="font-bold text-text text-base">
                  {currentStop?.stationName || currentStop?.stationId || 'Awaiting Departure'}
                </div>
                <div className="text-xs text-text-secondary">
                  {currentStop?.actualDeparture ? `Departed` : 'Scheduled'}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Next Station</div>
                <div className="font-bold text-text text-base">
                  {nextStop?.stationName || (progress?.nextStopIdx === -1 ? 'Journey Completed' : 'En route')}
                </div>
                <div className="text-xs text-text-secondary">
                  {progress?.remainingDistanceKm != null ? `${Math.round(progress.remainingDistanceKm)} km left` : ''}
                </div>
              </div>
            </div>

            <div className="w-full bg-surface h-2.5 rounded-pill overflow-hidden border border-border">
              <div className="bg-accent h-full rounded-pill" style={{ width: `${progress?.percent || 0}%` }} />
            </div>
            <div className="text-right text-[11px] text-text-tertiary">
              Snapshot synced via RailRadar · Live telemetry subject to provider update cycles
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
