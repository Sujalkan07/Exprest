'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Train } from '@exprest/types';

export const TrainSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const { data, isLoading } = useQuery<{ data: { items: Train[] } }>({
    queryKey: ['trainSearch', query],
    queryFn: async () => {
      if (!query.trim()) return { data: { items: [] } };
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiBase}/api/v1/trains/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.trim().length > 0,
  });

  const trains = data?.data?.items || [];

  const handleSelect = (train: Train) => {
    const today = new Date().toISOString().split('T')[0];
    router.push(`/journey/journey_${train.number}_${today}`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search train by number or name (e.g. 12433 or Rajdhani)"
          className="w-full h-14 px-5 pr-12 text-base bg-surface border border-border rounded-hero shadow-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder:text-text-tertiary"
        />
        {isLoading && (
          <div className="absolute right-4 top-4 text-xs text-text-tertiary animate-pulse">
            Searching...
          </div>
        )}
      </div>

      {query.trim().length > 0 && (
        <div className="mt-2 bg-surface-elevated border border-border rounded-card shadow-md overflow-hidden divide-y divide-border">
          {trains.length === 0 && !isLoading ? (
            <div className="p-4 text-sm text-text-secondary text-center">
              Nothing matched this train number or name.
            </div>
          ) : (
            trains.map((train) => (
              <button
                key={train.id}
                onClick={() => handleSelect(train)}
                className="w-full p-4 text-left hover:bg-surface transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-accent">{train.number}</span>
                    <span className="font-semibold text-text">{train.name}</span>
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    Route: Chennai Central → New Delhi
                  </div>
                </div>
                <span className="text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Track Train →
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
