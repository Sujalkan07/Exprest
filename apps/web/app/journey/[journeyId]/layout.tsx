'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { TopBar } from '@/components/common/TopBar';
import { StatusPill } from '@/components/common/StatusPill';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function JourneyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const journeyId = params.journeyId as string;
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['journey', journeyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/journeys/${journeyId}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });

  const journeyData = data?.data;

  // Build origin → destination display
  const originName = journeyData?.train?.originStationName
    || journeyData?.stops?.[0]?.stationName
    || journeyData?.train?.originStationId
    || '';
  const destName = journeyData?.train?.destinationStationName
    || journeyData?.stops?.[journeyData?.stops?.length - 1]?.stationName
    || journeyData?.train?.destinationStationId
    || '';

  const tabs = [
    { label: 'Overview', href: `/journey/${journeyId}` },
    { label: 'Live Map', href: `/journey/${journeyId}/map` },
    { label: 'Analytics', href: `/journey/${journeyId}/analytics` },
    { label: 'Companion', href: `/journey/${journeyId}/companion` },
  ];

  const handleShareOpen = async () => {
    if (!shareToken) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/shares`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ journeyId }),
        });
        const json = await res.json();
        setShareToken(json?.data?.shareToken || 'shr_error');
      } catch {
        setShareToken('shr_error');
      }
    }
    setShowShareModal(true);
  };

  const shareUrl = shareToken
    ? `${window.location.origin}/share/${shareToken}`
    : '';

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const delayMinutes = journeyData?.run?.delayMinutes ?? 0;

  const isMapRoute = pathname.endsWith('/map');

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {!isMapRoute && <TopBar />}

      {/* Train Header */}
      {!isMapRoute && (
        <section className="bg-surface-elevated border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-accent">
                    {journeyData?.train?.number || '—'}
                  </span>
                  <h1 className="text-xl font-bold text-text">
                    {journeyData?.train?.name || 'Loading…'}
                  </h1>
                </div>
                <div className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                  {originName && destName ? (
                    <span>{originName} → {destName}</span>
                  ) : (
                    <span className="text-text-tertiary animate-pulse">Loading route…</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <StatusPill
                  status={journeyData?.run?.status || 'RUNNING'}
                  delayMinutes={delayMinutes}
                />
                <div className="text-right text-xs text-text-tertiary">
                  {journeyData ? 'Live' : 'Loading…'}
                </div>
                <button
                  onClick={handleShareOpen}
                  className="px-3.5 py-1.5 bg-accent text-white rounded-control text-xs font-semibold hover:bg-black transition-colors"
                >
                  Share
                </button>
              </div>
            </div>

            {/* Tab Nav */}
            <nav className="flex gap-6 mt-6 border-t border-border pt-3">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
                      isActive
                        ? 'border-accent text-accent'
                        : 'border-transparent text-text-secondary hover:text-text'
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>
      )}

      <main className="flex-1 w-full relative">
        {children}
      </main>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-elevated border border-border rounded-card max-w-md w-full p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text">Share Journey</h3>
              <button onClick={() => setShowShareModal(false)} className="text-text-tertiary hover:text-text">✕</button>
            </div>
            <div className="p-3 bg-surface rounded-control border border-border mb-4 text-xs">
              <div className="font-bold text-text">
                {journeyData?.train?.number} {journeyData?.train?.name}
              </div>
              <div className="text-text-secondary mt-0.5">
                {delayMinutes > 0 ? `${delayMinutes}m late` : 'On time'}
                {journeyData?.livePosition?.currentStationName
                  ? ` · Near ${journeyData.livePosition.currentStationName}`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full text-xs p-2.5 bg-surface border border-border rounded-control text-text-secondary"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 bg-accent text-white text-xs font-semibold rounded-control whitespace-nowrap hover:bg-black"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
