'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/common/TopBar';
import { StatusRibbon } from '@/components/alternatives/StatusRibbon';
import {
  AlternativesSearchCard,
  SearchFormData,
} from '@/components/alternatives/AlternativesSearchCard';
import { OriginalRequestBanner } from '@/components/alternatives/OriginalRequestBanner';
import { AlternativesFilterSidebar } from '@/components/alternatives/AlternativesFilterSidebar';
import { SameTrainCard } from '@/components/alternatives/SameTrainCard';
import { DirectTrainCard } from '@/components/alternatives/DirectTrainCard';
import { ConnectingTrainCard } from '@/components/alternatives/ConnectingTrainCard';
import { ComparisonTray } from '@/components/alternatives/ComparisonTray';
import { ComparisonModal } from '@/components/alternatives/ComparisonModal';
import { CoachSpecsModal } from '@/components/alternatives/CoachSpecsModal';
import {
  SkeletonLoader,
  EmptyState,
  ErrorState,
  ShareToast,
} from '@/components/alternatives/EmptyAndLoadingStates';
import {
  FilterOptions,
  SortCriteria,
  ComparisonItem,
  AlternativeJourneysResult,
} from '@/components/alternatives/types';
import { getTodayIST } from '@/components/alternatives/dateUtils';
import { apiFetch } from '@/lib/api';

const DEFAULT_FILTERS: FilterOptions = {
  includeEarlierStop: true,
  maxLayoverMinutes: 240, // 4 hours
  maxDurationMinutes: 2880, // 48 hours
  maxFare: 5000,
  directOnly: false,
  availableOnly: false,
  sameStationOnly: false,
};

type ActiveTab = 'tab-sametrain' | 'tab-direct' | 'tab-connecting';

export const AlternativesClient: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read search parameters from URL
  const fromParam = (searchParams.get('from') || '').trim().toUpperCase();
  const toParam = (searchParams.get('to') || '').trim().toUpperCase();
  const dateParam = searchParams.get('date') || getTodayIST();
  const classParam = searchParams.get('class') || 'ALL';

  const [searchData, setSearchData] = useState<SearchFormData>({
    originCode: fromParam,
    originName: fromParam,
    destinationCode: toParam,
    destinationName: toParam,
    date: dateParam,
    travelClass: classParam,
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('tab-sametrain');
  const [activeSort, setActiveSort] = useState<SortCriteria>('best');
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  // Comparison tray state (up to 3 items, starts empty)
  const [comparedItems, setComparedItems] = useState<ComparisonItem[]>([]);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  // Coach specs modal state
  const [coachModalInfo, setCoachModalInfo] = useState<{
    isOpen: boolean;
    trainNumber: string;
    trainName: string;
  }>({
    isOpen: false,
    trainNumber: '',
    trainName: '',
  });

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Data fetching state
  const hasQueryParams = Boolean(fromParam && toParam);
  const [isLoading, setIsLoading] = useState(hasQueryParams);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journeyData, setJourneyData] = useState<AlternativeJourneysResult | null>(null);

  // Single URL-driven effect: runs when searchParams change
  useEffect(() => {
    const from = (searchParams.get('from') || '').trim().toUpperCase();
    const to = (searchParams.get('to') || '').trim().toUpperCase();
    const date = searchParams.get('date') || getTodayIST();
    const travelClass = searchParams.get('class') || 'ALL';
    const trainNumber = (searchParams.get('train') || '').trim();

    setSearchData({
      originCode: from,
      originName: from,
      destinationCode: to,
      destinationName: to,
      date,
      travelClass,
    });

    // P0: Opening /alternatives without query parameters must NOT run an automatic search
    if (!from || !to) {
      setJourneyData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (from === to) {
      setError('Origin and destination stations cannot be the same station.');
      setIsLoading(false);
      setJourneyData(null);
      return;
    }

    let isSubscribed = true;
    setIsLoading(true);
    setError(null);

    const q = new URLSearchParams({
      from,
      to,
      date,
      class: travelClass,
    });
    if (trainNumber) {
      q.set('trainNumber', trainNumber);
    }

    apiFetch<any>(`/api/v1/journeys/alternatives?${q.toString()}`, { timeoutMs: 15000 })
      .then((res) => {
        if (!isSubscribed) return;
        const payload: AlternativeJourneysResult = res?.data || res;
        setJourneyData(payload);

        // Auto-switch to tab with results if current tab is empty
        if (payload?.sameTrainAlternatives && payload.sameTrainAlternatives.length > 0) {
          setActiveTab('tab-sametrain');
        } else if (payload?.directAlternatives && payload.directAlternatives.length > 0) {
          setActiveTab('tab-direct');
        } else if (payload?.connectingAlternatives && payload.connectingAlternatives.length > 0) {
          setActiveTab('tab-connecting');
        }
      })
      .catch((err: any) => {
        if (!isSubscribed) return;
        setError(err?.message || 'Failed to fetch alternative journeys.');
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [searchParams]);

  // Handle Search Submission: update URL only, letting the URL effect perform the single fetch
  const handleSearch = (newSearch: SearchFormData) => {
    const params = new URLSearchParams({
      from: newSearch.originCode,
      to: newSearch.destinationCode,
      date: newSearch.date,
      class: newSearch.travelClass,
    });
    router.push(`/alternatives?${params.toString()}`);
  };

  // Manual refresh via OriginalRequestBanner
  const handleRefresh = useCallback(async () => {
    if (!searchData.originCode || !searchData.destinationCode) return;
    setIsRefreshing(true);
    try {
      const q = new URLSearchParams({
        from: searchData.originCode,
        to: searchData.destinationCode,
        date: searchData.date,
        class: searchData.travelClass,
      });
      const res = await apiFetch<any>(`/api/v1/journeys/alternatives?${q.toString()}`, {
        timeoutMs: 15000,
      });
      const payload: AlternativeJourneysResult = res?.data || res;
      setJourneyData(payload);
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh alternative journeys.');
    } finally {
      setIsRefreshing(false);
    }
  }, [searchData]);

  // Check if filters differ from default
  const hasActiveFilters = useMemo(() => {
    return (
      !filters.includeEarlierStop ||
      filters.maxLayoverMinutes !== DEFAULT_FILTERS.maxLayoverMinutes ||
      filters.maxDurationMinutes !== DEFAULT_FILTERS.maxDurationMinutes ||
      filters.maxFare !== DEFAULT_FILTERS.maxFare ||
      filters.directOnly ||
      filters.availableOnly ||
      filters.sameStationOnly
    );
  }, [filters]);

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Comparison toggle
  const handleToggleCompare = (item: ComparisonItem) => {
    setComparedItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      if (prev.length >= 3) {
        setToastMessage('You can compare up to 3 candidate pathways at a time.');
        return prev;
      }
      return [...prev, item];
    });
  };

  const handleClearCompare = () => {
    setComparedItems([]);
  };

  // Coach specs trigger
  const handleViewCoachSpecs = (trainNumber: string, trainName: string) => {
    setCoachModalInfo({
      isOpen: true,
      trainNumber,
      trainName,
    });
  };

  // Share trigger
  const handleShare = (title: string) => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard
        ?.writeText(url)
        .then(() => {
          setToastMessage(`Link copied! Shared: ${title}`);
        })
        .catch(() => {
          setToastMessage(`URL: ${url}`);
        });
    }
  };

  // Dismiss toast after 3.5s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Filtered and sorted lists — Data-Integrity: Never treat null fare or duration as 0!
  const filteredSameTrain = useMemo(() => {
    if (!journeyData?.sameTrainAlternatives || !filters.includeEarlierStop || filters.directOnly) {
      return [];
    }

    return journeyData.sameTrainAlternatives
      .filter((item) => {
        if (
          filters.availableOnly &&
          !item.availabilityAvailable &&
          item.availabilityCategory !== 'AVAILABLE' &&
          item.availabilityCategory !== 'RAC'
        ) {
          return false;
        }
        if (item.fare != null && item.fare > filters.maxFare) return false;
        if (
          item.totalJourneyMinutes > 0 &&
          item.totalJourneyMinutes > filters.maxDurationMinutes
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (activeSort === 'cheapest') {
          if (a.fare == null && b.fare == null) return 0;
          if (a.fare == null) return 1;
          if (b.fare == null) return -1;
          return a.fare - b.fare;
        }
        if (activeSort === 'fastest') {
          if (!a.totalJourneyMinutes && !b.totalJourneyMinutes) return 0;
          if (!a.totalJourneyMinutes) return 1;
          if (!b.totalJourneyMinutes) return -1;
          return a.totalJourneyMinutes - b.totalJourneyMinutes;
        }
        if (activeSort === 'earliest') {
          return a.arrivalTimeDestination.localeCompare(b.arrivalTimeDestination);
        }
        // Default / best: lowest fare difference, then shortest journey
        const diffA = a.fareDifference ?? 9999;
        const diffB = b.fareDifference ?? 9999;
        return diffA - diffB;
      });
  }, [journeyData?.sameTrainAlternatives, filters, activeSort]);

  const filteredDirectTrains = useMemo(() => {
    if (!journeyData?.directAlternatives) return [];

    return journeyData.directAlternatives
      .filter((train) => {
        if (
          filters.availableOnly &&
          !train.availabilityAvailable &&
          train.availabilityCategory !== 'AVAILABLE' &&
          train.availabilityCategory !== 'RAC'
        ) {
          return false;
        }
        if (train.fare != null && train.fare > filters.maxFare) return false;
        if (
          train.durationMinutes > 0 &&
          train.durationMinutes > filters.maxDurationMinutes
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (activeSort === 'cheapest') {
          if (a.fare == null && b.fare == null) return 0;
          if (a.fare == null) return 1;
          if (b.fare == null) return -1;
          return a.fare - b.fare;
        }
        if (activeSort === 'fastest') {
          if (!a.durationMinutes && !b.durationMinutes) return 0;
          if (!a.durationMinutes) return 1;
          if (!b.durationMinutes) return -1;
          return a.durationMinutes - b.durationMinutes;
        }
        if (activeSort === 'earliest') {
          return a.arrivalTime.localeCompare(b.arrivalTime);
        }
        // Best: duration then fare
        const durA = a.durationMinutes || 9999;
        const durB = b.durationMinutes || 9999;
        return durA - durB;
      });
  }, [journeyData?.directAlternatives, filters, activeSort]);

  const filteredConnecting = useMemo(() => {
    if (!journeyData?.connectingAlternatives || filters.directOnly) return [];

    return journeyData.connectingAlternatives
      .filter((con) => {
        if (
          filters.availableOnly &&
          con.availabilityCategory !== 'AVAILABLE' &&
          con.availabilityCategory !== 'RAC'
        ) {
          return false;
        }
        if (filters.sameStationOnly && con.leg1.to.code !== con.leg2.from.code) {
          return false;
        }
        if (con.totalFare != null && con.totalFare > filters.maxFare) return false;
        if (
          con.totalDurationMinutes > 0 &&
          con.totalDurationMinutes > filters.maxDurationMinutes
        ) {
          return false;
        }
        if (con.transferLayoverMinutes > filters.maxLayoverMinutes) return false;
        return true;
      })
      .sort((a, b) => {
        if (activeSort === 'cheapest') {
          if (a.totalFare == null && b.totalFare == null) return 0;
          if (a.totalFare == null) return 1;
          if (b.totalFare == null) return -1;
          return a.totalFare - b.totalFare;
        }
        if (activeSort === 'fastest') {
          if (!a.totalDurationMinutes && !b.totalDurationMinutes) return 0;
          if (!a.totalDurationMinutes) return 1;
          if (!b.totalDurationMinutes) return -1;
          return a.totalDurationMinutes - b.totalDurationMinutes;
        }
        if (activeSort === 'earliest') {
          return a.leg2.arrivalTime.localeCompare(b.leg2.arrivalTime);
        }
        return a.totalDurationMinutes - b.totalDurationMinutes;
      });
  }, [journeyData?.connectingAlternatives, filters, activeSort]);

  // Counts for tabs
  const sameTrainCount = filteredSameTrain.length;
  const directCount = filteredDirectTrains.length;
  const connectingCount = filteredConnecting.length;

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans">
      {/* 1. Official Exprest Header */}
      <TopBar />

      {/* 2. Status Ribbon & Breadcrumbs */}
      <StatusRibbon
        sourceType={journeyData?.telemetryFreshness?.isLive ? 'live' : 'mock'}
        lastUpdated={journeyData?.telemetryFreshness?.fetchedAt}
      />

      {/* Main Content Area */}
      <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        {/* 3. Search Card */}
        <AlternativesSearchCard
          initialData={searchData}
          isLoading={isLoading}
          onSearch={handleSearch}
          activeSort={activeSort}
          onSortChange={setActiveSort}
          maxFareBudget={filters.maxFare}
        />

        {/* 4. Original Request Context Banner */}
        {journeyData && journeyData.originStation && journeyData.destinationStation && (
          <OriginalRequestBanner
            origin={journeyData.originStation}
            destination={journeyData.destinationStation}
            date={journeyData.query?.date || searchData.date}
            travelClass={journeyData.query?.class || searchData.travelClass}
            trainName={`${journeyData.originStation.name} → ${journeyData.destinationStation.name} Corridor`}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />
        )}

        {/* 5. Main Workstation 2-Column Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Filter Sidebar (3 cols) */}
          <div className="lg:col-span-3">
            <AlternativesFilterSidebar
              filters={filters}
              onChange={setFilters}
              onReset={handleResetFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          {/* Right Column: Tabs & Cards (9 cols) */}
          <div className="lg:col-span-9 flex flex-col gap-4">
            {/* Functional Category Tabs */}
            <div
              className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
              role="tablist"
            >
              {/* Tab 1: Same Train Alternative */}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tab-sametrain'}
                onClick={() => setActiveTab('tab-sametrain')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'tab-sametrain'
                    ? 'bg-text text-bg shadow-sm'
                    : 'text-text-secondary hover:text-text hover:bg-surface border border-transparent hover:border-border'
                }`}
              >
                <span className="material-symbols-outlined text-[18px] text-amber-500">
                  alt_route
                </span>
                <span>Same Train, Alternative Segment ({sameTrainCount})</span>
              </button>

              {/* Tab 2: Alternative Direct Trains */}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tab-direct'}
                onClick={() => setActiveTab('tab-direct')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'tab-direct'
                    ? 'bg-text text-bg shadow-sm'
                    : 'text-text-secondary hover:text-text hover:bg-surface border border-transparent hover:border-border'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">train</span>
                <span>Alternative Direct Trains ({directCount})</span>
              </button>

              {/* Tab 3: Connecting Journeys */}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tab-connecting'}
                onClick={() => setActiveTab('tab-connecting')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'tab-connecting'
                    ? 'bg-text text-bg shadow-sm'
                    : 'text-text-secondary hover:text-text hover:bg-surface border border-transparent hover:border-border'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  transfer_within_a_station
                </span>
                <span>Connecting Journeys ({connectingCount})</span>
              </button>
            </div>

            {/* Results Display */}
            {!journeyData && !isLoading && !error ? (
              /* P0 Initial State: Empty origin/destination with informative guidance */
              <div className="w-full bg-surface rounded-3xl p-8 sm:p-12 border border-border shadow-xs flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-text text-2xl">
                  <span className="material-symbols-outlined text-[32px]">alt_route</span>
                </div>
                <div className="max-w-md">
                  <h3 className="text-base font-bold text-text">
                    Plan Your Journey Alternatives
                  </h3>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                    Enter an origin and destination station above to discover candidate same-train quota allocations, alternative direct express services, and verified connection hubs.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <SkeletonLoader />
            ) : error ? (
              <ErrorState
                message={error}
                onRetry={() => {
                  if (searchData.originCode && searchData.destinationCode) {
                    handleSearch(searchData);
                  }
                }}
              />
            ) : (
              <>
                {/* Tab 1 Content: Same Train Alternative Segment */}
                {activeTab === 'tab-sametrain' && (
                  <div className="flex flex-col gap-4">
                    {filteredSameTrain.length === 0 ? (
                      <EmptyState onResetFilters={handleResetFilters} />
                    ) : (
                      filteredSameTrain.map((item) => (
                        <SameTrainCard
                          key={`st-${item.trainNumber}-${item.ticketedOrigin.code}`}
                          alternative={item}
                          isCompared={comparedItems.some(
                            (c) => c.id === `st-${item.trainNumber}-${item.ticketedOrigin.code}`
                          )}
                          onToggleCompare={handleToggleCompare}
                          onViewCoachSpecs={handleViewCoachSpecs}
                          onShare={handleShare}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Tab 2 Content: Alternative Direct Trains */}
                {activeTab === 'tab-direct' && (
                  <div className="flex flex-col gap-4">
                    {filteredDirectTrains.length === 0 ? (
                      <EmptyState onResetFilters={handleResetFilters} />
                    ) : (
                      filteredDirectTrains.map((train) => (
                        <DirectTrainCard
                          key={`dt-${train.trainNumber}`}
                          train={train}
                          isCompared={comparedItems.some((c) => c.id === `dt-${train.trainNumber}`)}
                          onToggleCompare={handleToggleCompare}
                          onViewCoachSpecs={handleViewCoachSpecs}
                          onShare={handleShare}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3 Content: Connecting Journeys */}
                {activeTab === 'tab-connecting' && (
                  <div className="flex flex-col gap-4">
                    {filteredConnecting.length === 0 ? (
                      <EmptyState onResetFilters={handleResetFilters} />
                    ) : (
                      filteredConnecting.map((connection) => {
                        const id = `con-${connection.interchangeStation.code}-${connection.leg1.trainNumber}-${connection.leg2.trainNumber}`;
                        return (
                          <ConnectingTrainCard
                            key={id}
                            connection={connection}
                            isCompared={comparedItems.some((c) => c.id === id)}
                            onToggleCompare={handleToggleCompare}
                            onViewCoachSpecs={handleViewCoachSpecs}
                            onShare={handleShare}
                          />
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}

            {/* Category Evaluation Summary Note */}
            <div className="mt-4 p-4 rounded-2xl bg-surface border border-border text-xs text-text-secondary flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] text-text-tertiary shrink-0 mt-0.5">
                verified_user
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-text">
                  Exprest Journey Intelligence Guarantee
                </span>
                <p className="leading-relaxed">
                  All alternative options are calculated from published timetables, safe transfer buffers (&gt;45 min at designated junctions), and Indian Railways Commercial Rules. Never board without completing the mandatory IRCTC boarding point change on earlier-station tickets.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Disclaimer Bar */}
      <footer className="w-full bg-surface-container-low border-t border-border mt-auto">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-text-secondary">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-text font-semibold">Exprest RailRadar Live Sync</span>
            </div>
            <span className="text-border hidden sm:inline">•</span>
            <span>INDIAN RAILWAYS INTELLIGENCE ENGINE</span>
          </div>
          <div className="flex items-center gap-6 text-text-secondary">
            <span className="hover:text-text cursor-pointer">Corridor Guide</span>
            <span className="hover:text-text cursor-pointer">Boarding Point FAQs</span>
            <span className="hover:text-text cursor-pointer">IRCTC Rule 142</span>
            <span className="hover:text-text cursor-pointer">Privacy &amp; Terms</span>
          </div>
        </div>
      </footer>

      {/* Floating Comparison Tray */}
      <ComparisonTray
        items={comparedItems}
        onOpenMatrix={() => setIsMatrixOpen(true)}
        onClear={handleClearCompare}
      />

      {/* Side-by-Side Comparison Matrix Modal */}
      <ComparisonModal
        isOpen={isMatrixOpen}
        items={comparedItems}
        onClose={() => setIsMatrixOpen(false)}
        onClearAll={() => {
          handleClearCompare();
          setIsMatrixOpen(false);
        }}
      />

      {/* Coach Specs Information Dialog */}
      <CoachSpecsModal
        isOpen={coachModalInfo.isOpen}
        trainNumber={coachModalInfo.trainNumber}
        trainName={coachModalInfo.trainName}
        onClose={() => setCoachModalInfo({ isOpen: false, trainNumber: '', trainName: '' })}
      />

      {/* Share Toast Notification */}
      {toastMessage && (
        <ShareToast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  );
};
