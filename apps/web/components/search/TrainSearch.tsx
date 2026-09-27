'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Train } from '@exprest/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TrainSearchProps {
  onSearchSelect?: (train: Train) => void;
}

export const TrainSearch: React.FC<TrainSearchProps> = ({ onSearchSelect }) => {
  const [query, setQuery] = React.useState('');
  const router = useRouter();

  const { data, isLoading } = useQuery<{ data: Train[]; success: boolean }>({
    queryKey: ['trainSearch', query],
    queryFn: async () => {
      if (!query.trim()) return { data: [], success: true };
      const res = await fetch(`${API_BASE}/api/v1/trains/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });

  // Handle both {data:{items:[]}} and {data:[]} shapes
  const trains: Train[] = Array.isArray(data?.data)
    ? (data?.data as Train[])
    : ((data as any)?.data?.items || []);

  const handleSelect = (train: Train) => {
    const today = new Date().toISOString().split('T')[0];
    const journeyId = `journey_${train.number}_${today}`;
    onSearchSelect?.(train);
    setQuery('');
    router.push(`/journey/${journeyId}`);
  };

  return (
    <div className="w-full max-w-[720px] relative mx-auto text-left">
      <div className="w-full h-14 bg-surface-container-lowest border border-border rounded-xl shadow-sm px-4 flex items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
        <span className="material-symbols-outlined text-text-tertiary text-[22px]">search</span>
        <input
          autoFocus
          className="flex-1 bg-transparent border-none p-0 text-on-surface placeholder:text-text-tertiary text-[15px] focus:ring-0 focus:outline-none"
          placeholder="Search train by number or name (e.g. 12345 or Rajdhani Express)"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-2">
          {isLoading && <span className="text-xs text-text-tertiary animate-pulse mr-2">Searching...</span>}
          <div className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-surface border border-border text-[11px] font-semibold text-text-tertiary">
            ⌘K
          </div>
          <button className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150 ease-out active:scale-95 shadow-sm">
            <span>Track Live</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>
      
      <div className="flex items-center justify-between text-[11px] font-semibold text-text-tertiary mt-2 px-1">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">gps_fixed</span>
          Live GPS telemetry updated every 500ms
        </span>
        <span className="hover:text-on-surface cursor-pointer transition-colors">Press Enter ↵ to lock route</span>
      </div>

      {query.trim().length > 0 && (
        <div className="absolute top-[68px] left-0 w-full z-50 bg-surface-container-lowest border border-border rounded-xl shadow-lg overflow-hidden divide-y divide-border">
          {trains.length === 0 && !isLoading ? (
            <div className="p-4 text-[13px] text-on-surface-variant text-center">
              Nothing matched — try a different number or name.
            </div>
          ) : (
            trains.map((train) => (
              <button
                key={train.id}
                onClick={() => handleSelect(train)}
                className="w-full p-4 text-left hover:bg-surface-container transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{train.number}</span>
                    <span className="font-medium text-on-surface">{train.name}</span>
                  </div>
                  <div className="text-[12px] text-on-surface-variant mt-1 flex items-center gap-1">
                    {(train as any).originStationName || train.originStationId}
                    <span className="material-symbols-outlined text-[14px] opacity-70">east</span>
                    {(train as any).destinationStationName || train.destinationStationId}
                  </div>
                </div>
                <span className="text-[12px] font-medium text-info opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Track <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
