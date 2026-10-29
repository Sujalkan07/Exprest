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

  // Query state initialized from URL or defaults
  const fromParam = (searchParams.get('from') || 'BZA').toUpperCase();
  const toParam = (searchParams.get('to') || 'LKO').toUpperCase();
  const dateParam = searchParams.get('date') || getTodayIST();
  const classParam = searchParams.get('class') || 'ALL';

  const [searchData, setSearchData] = useState<SearchFormData>({
    originCode: fromParam,
    originName: fromParam === 'BZA' ? 'Vijayawada Junction' : fromParam,
    destinationCode: toParam,
    destinationName: toParam === 'LKO' ? 'Lucknow Charbagh' : toParam,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journeyData, setJourneyData] = useState<AlternativeJourneysResult | null>(null);

  // Fetch alternatives from API
  const fetchAlternatives = useCallback(async (params: SearchFormData, isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setError(null);
    }

    try {
      const q = new URLSearchParams({
        from: params.originCode,
        to: params.destinationCode,
        date: params.date,
        class: params.travelClass,
      });

      const res = await apiFetch<any>(
        `/api/v1/journeys/alternatives?${q.toString()}`,
        { timeoutMs: 15000 }
      );

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
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch alternative journeys.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Run on mount or when URL params change
  useEffect(() => {
    fetchAlternatives(searchData);
  }, [fetchAlternatives, searchData]);

  // Handle Search Submission
  const handleSearch = (newSearch: SearchFormData) => {
    setSearchData(newSearch);
    const params = new URLSearchParams({
      from: newSearch.originCode,
      to: newSearch.destinationCode,
      date: newSearch.date,
      class: newSearch.travelClass,
    });
    router.push(`/alternatives?${params.toString()}`);
    fetchAlternatives(newSearch);
  };

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
      navigator.clipboard?.writeText(url).then(() => {
        setToastMessage(`Link copied! Shared: ${title}`);
      }).catch(() => {
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

  // Filtered and sorted lists
  const filteredSameTrain = useMemo(() => {
    if (!journeyData?.sameTrainAlternatives || !filters.includeEarlierStop || filters.directOnly) {
      return [];
    }

    return journeyData.sameTrainAlternatives
      .filter((item) => {
        const fare = item.fare || 0;
        if (fare > filters.maxFare) return false;
        if (item.totalJourneyMinutes > filters.maxDurationMinutes) return false;
        return true;
      })
      .sort((a, b) => {
        const fareA = a.fare || 0;
        const fareB = b.fare || 0;
        if (activeSort === 'cheapest') return fareA - fareB;
        if (activeSort === 'fastest') return a.totalJourneyMinutes - b.totalJourneyMinutes;
        if (activeSort === 'earliest') return a.arrivalTimeDestination.localeCompare(b.arrivalTimeDestination);
        // Default / best: lowest fare difference, then lowest distance difference
        const diffA = a.fareDifference || 0;
        const diffB = b.fareDifference || 0;
        return diffA - diffB;
      });
  }, [journeyData?.sameTrainAlternatives, filters, activeSort]);

  const filteredDirectTrains = useMemo(() => {
    if (!journeyData?.directAlternatives) return [];

    return journeyData.directAlternatives
      .filter((train) => {
        const fare = train.fare || 0;
        if (fare > filters.maxFare) return false;
        if (train.durationMinutes > filters.maxDurationMinutes) return false;
        return true;
      })
      .sort((a, b) => {
        const fareA = trainA(a);
        const fareB = trainA(b);
        if (activeSort === 'cheapest') return fareA - fareB;
        if (activeSort === 'fastest') return a.durationMinutes - b.durationMinutes;
        if (activeSort === 'earliest') return a.arrivalTime.localeCompare(b.arrivalTime);
        // Best: sort by duration then fare
        return a.durationMinutes - b.durationMinutes;
      });
    function trainA(t: { fare: number | null }) {
      return t.fare || 0;
    }
  }, [journeyData?.directAlternatives, filters, activeSort]);

  const filteredConnecting = useMemo(() => {
    if (!journeyData?.connectingAlternatives || filters.directOnly) return [];

    return journeyData.connectingAlternatives
      .filter((con) => {
        const fare = con.totalFare || 0;
        if (fare > filters.maxFare) return false;
        if (con.totalDurationMinutes > filters.maxDurationMinutes) return false;
        if (con.transferLayoverMinutes > filters.maxLayoverMinutes) return false;
        return true;
      })
      .sort((a, b) => {
        const fareA = con.fare(a);
        const fareB = con.fare(b);
        if (activeSort === 'cheapest') return fareA - fareB;
        if (activeSort === 'fastest') return a.totalDurationMinutes - b.totalDurationMinutes;
        if (activeSort === 'earliest') return a.leg2.arrivalTime.localeCompare(b.leg2.arrivalTime);
        // Best: lowest layover with reasonable duration
        return a.totalDurationMinutes - b.totalDurationMinutes;
      });
    function con() {}
    con.fare = (c: { totalFare: number | null }) => c.totalFare || 0;
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
            onRefresh={() => fetchAlternatives(searchData, true)}
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
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2" role="tablist">
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
            {isLoading ? (
              <SkeletonLoader />
            ) : error ? (
              <ErrorState
                message={error}
                onRetry={() => fetchAlternatives(searchData)}
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
