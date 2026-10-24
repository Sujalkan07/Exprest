'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Train } from '@exprest/types';
import { DarkModeToggle } from '@/components/common/DarkModeToggle';
import { Logo } from '@/components/common/Logo';

import { API_BASE } from '@/lib/api';

interface RecentSearch {
  number: string;
  name: string;
  journeyId: string;
  date: string;
  status?: 'on-time' | 'delayed' | 'boarding';
  delay?: string;
}

export interface FavoriteTrainItem {
  number: string;
  name: string;
  type: string;
  from: string;
  to: string;
  status: 'scheduled' | 'on-time' | 'delayed' | 'boarding';
  statusLabel: string;
  sector: string;
  speed: string;
  platform: string;
  eta: string;
  progress: number;
  journeyId: string;
}

const getTodayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

function statusColor(status: 'scheduled' | 'on-time' | 'delayed' | 'boarding') {
  if (status === 'scheduled') return 'text-secondary';
  if (status === 'on-time' || status === 'boarding') return 'text-success';
  if (status === 'delayed') return 'text-warning';
  return 'text-secondary';
}
function statusDot(status: 'scheduled' | 'on-time' | 'delayed' | 'boarding') {
  if (status === 'scheduled') return 'bg-neutral-400 dark:bg-neutral-600';
  if (status === 'on-time' || status === 'boarding') return 'bg-success';
  if (status === 'delayed') return 'bg-warning';
  return 'bg-secondary';
}

// ─── Inline Search Bar ────────────────────────────────────────────────────────
function SearchBar({
  onSelect,
}: {
  onSelect: (train: Train) => void;
}) {
  const [query, setQuery] = React.useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ data: Train[]; success: boolean }>({
    queryKey: ['trainSearch', query],
    queryFn: async () => {
      if (!query.trim()) return { data: [], success: true };
      const res = await fetch(
        `${API_BASE}/api/v1/trains/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      return res.json();
    },
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });

  const trains: Train[] = Array.isArray(data?.data)
    ? (data?.data as Train[])
    : ((data as any)?.data?.items || []);

  const handleSelect = (train: Train) => {
    // Use IST date — not UTC; IST is UTC+5:30 so UTC date can differ around midnight
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const journeyId = `journey_${train.number}_${today}`;
    onSelect(train);
    setQuery('');
    router.push(`/journey/${journeyId}`);
  };

  const handleTrackLive = () => {
    if (trains.length > 0) {
      handleSelect(trains[0]);
    } else if (query.trim()) {
      const q = query.trim();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      // If query is a numeric train number (4-5 digits), navigate directly to that journey
      if (/^\d{4,5}$/.test(q)) {
        setQuery('');
        router.push(`/journey/journey_${q}_${today}`);
      }
    }
  };

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative w-full">
      {/* Search input row */}
      <div className="w-full h-12 bg-surface-container-lowest border border-border hover:border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary rounded-xl px-3.5 flex items-center gap-2.5 transition-all shadow-sm">
        <span className="material-symbols-outlined text-text-tertiary text-[20px]">
          search
        </span>
        <input
          ref={inputRef}
          autoFocus
          className="flex-1 bg-transparent border-none p-0 text-on-surface placeholder:text-text-tertiary text-[14px] focus:ring-0 focus:outline-none"
          placeholder="Search train by number or name (e.g. 12345 or Rajdhani Express)"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleTrackLive()}
        />
        <div className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-surface text-[11px] font-mono text-text-tertiary mr-1">
          ⌘K
        </div>
        <button
          onClick={handleTrackLive}
          className="h-8 px-3.5 rounded-lg bg-primary hover:bg-neutral-800 text-on-primary text-[13px] font-medium flex items-center gap-1.5 transition-colors active:scale-[0.98]"
        >
          <span>Track Live</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </button>
      </div>

      {/* Hint row */}
      <div className="flex items-center justify-between text-[11px] text-text-tertiary mt-2 px-1">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">my_location</span>
          Real-time telemetry synced via RailRadar
        </span>
        <span>Press Enter ↵ to lock route</span>
      </div>

      {/* Dropdown results */}
      {query.trim().length > 0 && (
        <div className="absolute top-[68px] left-0 w-full z-50 bg-surface-container-lowest border border-border rounded-xl shadow-lg overflow-hidden divide-y divide-border">
          {trains.length === 0 && !isLoading ? (
            <div className="p-4 text-[13px] text-on-surface-variant text-center">
              Nothing matched — press Enter or Track Live to search directly.
            </div>
          ) : (
            trains.map((train) => (
              <button
                key={train.id || train.number}
                onClick={() => handleSelect(train)}
                className="w-full p-4 text-left hover:bg-surface-container transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{train.number}</span>
                    <span className="font-medium text-on-surface">{train.name}</span>
                    {train.type && (
                      <span className="text-[11px] uppercase tracking-wider text-text-tertiary ml-1">
                        {train.type}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-on-surface-variant mt-1 flex items-center gap-1">
                    {(train as any).originStationName || train.originStationId || 'Source'}
                    <span className="material-symbols-outlined text-[14px] opacity-70">east</span>
                    {(train as any).destinationStationName || train.destinationStationId || 'Destination'}
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
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function HomePage() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [favoriteTrains, setFavoriteTrains] = useState<FavoriteTrainItem[]>([]);
  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    isLoggedIn?: boolean;
  } | null>(null);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    // 1. Load Recent Searches from localStorage safely
    try {
      const stored = localStorage.getItem('exprest_recent_searches');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const validRecents = parsed.filter(
            (r): r is RecentSearch => Boolean(r && typeof r === 'object' && r.number && r.name && r.journeyId)
          );
          setRecentSearches(validRecents);
        } else {
          setRecentSearches([]);
        }
      } else {
        setRecentSearches([]);
      }
    } catch {
      setRecentSearches([]);
    }

    // 2. Load Favorite / Saved Trains dynamically from localStorage
    try {
      const storedFavs = localStorage.getItem('exprest_favorite_trains');
      if (storedFavs) {
        const parsed = JSON.parse(storedFavs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize legacy entries: neutralize any fabricated mock data (e.g. fake speeds or platforms)
          const sanitized: FavoriteTrainItem[] = parsed
            .filter((item): item is FavoriteTrainItem => Boolean(item && typeof item === 'object' && item.number && item.name))
            .map((item) => ({
              number: String(item.number),
              name: String(item.name),
              type: item.type || 'Express',
              from: item.from || 'Source',
              to: item.to || 'Destination',
              status: 'scheduled',
              statusLabel: item.statusLabel && !item.statusLabel.includes('delay') && !item.statusLabel.includes('On Time') ? item.statusLabel : 'Pinned Train',
              sector: item.sector || 'Rail Corridor',
              speed: '—',
              platform: '—',
              eta: '—',
              progress: 0,
              journeyId: item.journeyId || `journey_${item.number}_${getTodayIst()}`,
            }));
          setFavoriteTrains(sanitized);
        } else {
          setFavoriteTrains([]);
        }
      } else {
        setFavoriteTrains([]);
      }
    } catch {
      // Malformed localStorage JSON or corrupted data: fallback cleanly to empty state without crashing
      setFavoriteTrains([]);
    }

    // 3. User session check
    let isMounted = true;
    async function loadUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (session?.user) {
          const u = session.user;
          const name =
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            u.email?.split('@')[0] ||
            'User';
          setUser({ name, email: u.email || '', isLoggedIn: true });
          return;
        }
      } catch {}

      if (isMounted) setUser(null);
    }
    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        const u = session.user;
        const name =
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.email?.split('@')[0] ||
          'User';
        setUser({ name, email: u.email || '', isLoggedIn: true });
      } else {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      localStorage.removeItem('exprest_user');
    } catch {}
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  // Called whenever any train is searched or selected
  const handleSearchSelect = (train: Train) => {
    // IST date: Asia/Kolkata timezone prevents UTC midnight boundary skew
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const journeyId = `journey_${train.number}_${today}`;

    // 1. Update Recent Searches in state & localStorage
    const updatedRecent: RecentSearch[] = [
      { number: train.number, name: train.name, journeyId, date: today },
      ...recentSearches.filter((r) => r.number !== train.number),
    ].slice(0, 5);
    setRecentSearches(updatedRecent);
    try {
      localStorage.setItem('exprest_recent_searches', JSON.stringify(updatedRecent));
    } catch {}

    // 2. Prepend searched train to Favorite / Saved Trains dynamically
    const fromCode = (train as any).originStationId || (train as any).originStationName || 'NDLS';
    const toCode = (train as any).destinationStationId || (train as any).destinationStationName || 'DEST';
    const typeLabel =
      train.type ||
      (train.number.startsWith('22')
        ? 'Semi-High Speed'
        : train.number.startsWith('12')
        ? 'Superfast'
        : 'Express');

    const newFavoriteItem: FavoriteTrainItem = {
      number: train.number,
      name: train.name,
      type: typeLabel,
      from: fromCode,
      to: toCode,
      status: 'scheduled',
      statusLabel: 'Pinned Train',
      sector: (train as any).originStationName ? `${(train as any).originStationName} Corridor` : 'Rail Corridor',
      speed: '—',
      platform: '—',
      eta: '—',
      progress: 0,
      journeyId,
    };

    setFavoriteTrains((prev) => {
      const filtered = prev.filter(
        (f) => f.number !== train.number && !f.number.includes(train.number)
      );
      const updated = [newFavoriteItem, ...filtered].slice(0, 6);
      try {
        localStorage.setItem('exprest_favorite_trains', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Remove train from favorites
  const handleRemoveFavorite = (number: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = favoriteTrains.filter((t) => t.number !== number);
    setFavoriteTrains(updated);
    try {
      localStorage.setItem('exprest_favorite_trains', JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="bg-surface-container-lowest font-sans text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-surface-variant selection:text-primary">

      {/* ==================== TOP NAVIGATION BAR ==================== */}
      <header className="w-full bg-surface-container-lowest border-b border-border sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-6 max-w-6xl mx-auto h-13 py-2.5">
          {/* Brand + Nav */}
          <div className="flex items-center gap-8">
            <Logo imageClassName="h-7 sm:h-8 w-auto object-contain" />

            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/saved"
                className="text-secondary hover:text-on-surface text-[13px] font-normal transition-colors py-1 flex items-center gap-1.5"
              >
                <span>Saved Trains</span>
                <span className="text-text-tertiary text-[11px] font-mono tabular-nums">
                  {favoriteTrains.length}
                </span>
              </Link>
              <a
                className="text-primary font-medium text-[13px] py-1 border-b-[1.5px] border-primary -mb-px flex items-center gap-1.5"
                href="#radar"
              >
                <span>Live Radar</span>
              </a>
              <Link
                href="/pnr-status"
                className="text-secondary hover:text-on-surface text-[13px] font-normal transition-colors py-1"
              >
                PNR Status
              </Link>
              <Link
                href="/settings"
                className="text-secondary hover:text-on-surface text-[13px] font-normal transition-colors py-1"
              >
                Settings
              </Link>
            </nav>
          </div>

          {/* Right utilities */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-surface text-[11px] font-mono text-text-tertiary">
              <span>⌘K</span>
            </div>
            <DarkModeToggle />
            {user?.isLoggedIn ? (
              <button
                onClick={handleSignOut}
                title={`${user.name || 'User'} — Click to Sign Out`}
                className="w-7 h-7 rounded-full border border-border bg-primary text-on-primary flex items-center justify-center font-bold text-xs hover:opacity-90 transition-opacity"
              >
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </button>
            ) : (
              <Link
                href="/login"
                className="w-7 h-7 rounded-full border border-border overflow-hidden bg-surface-container flex items-center justify-center hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  account_circle
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 pt-10 pb-16 flex flex-col justify-start">

        {/* TWO-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10 items-start">

          {/* ── LEFT COLUMN: Hero + Search + Recent ── */}
          <div className="lg:col-span-5 flex flex-col gap-6">

            {/* Hero & network metadata */}
            <div>
              <div className="inline-flex items-center gap-2 text-[12px] text-secondary mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                <span className="font-medium text-on-surface">Indian Railways Network</span>
                <span className="text-border">·</span>
                <span className="font-mono text-[11px] text-text-tertiary">Live Telemetry &amp; Timetables</span>
              </div>
              <h1 className="text-[34px] sm:text-[38px] leading-[1.18] font-[650] text-on-surface tracking-[-0.03em] mb-2.5">
                Real-time train intelligence, simplified.
              </h1>
              <p className="text-[15px] leading-relaxed text-secondary">
                Track exact positions, delays, platform numbers, and live route speed with zero noise.
              </p>
            </div>

            {/* Search Bar */}
            <SearchBar onSelect={handleSearchSelect} />

            {/* Recent Searches */}
            <div className="w-full mt-2">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                  Recent Searches
                </span>
                {recentSearches.length > 0 && (
                  <button
                    onClick={() => {
                      setRecentSearches([]);
                      localStorage.removeItem('exprest_recent_searches');
                    }}
                    className="text-[12px] text-text-tertiary hover:text-on-surface transition-colors"
                  >
                    Clear history
                  </button>
                )}
              </div>

              {recentSearches.length === 0 ? (
                /* Default suggested recent items */
                <div className="flex flex-wrap gap-2 py-1">
                  {[
                    { number: '12951', name: 'Mumbai Tejas Rajdhani', from: 'NDLS', to: 'MMCT', status: 'Scheduled', color: 'text-success', dot: 'bg-success' },
                    { number: '22436', name: 'Vande Bharat Express', from: 'NDLS', to: 'BSB', status: 'Scheduled', color: 'text-success', dot: 'bg-success' },
                    { number: '12301', name: 'Howrah Rajdhani', from: 'HWH', to: 'NDLS', status: 'Scheduled', color: 'text-success', dot: 'bg-success' },
                    { number: '12626', name: 'Kerala Express', from: 'NDLS', to: 'TVC', status: 'Scheduled', color: 'text-success', dot: 'bg-success' },
                  ].map((item) => (
                    <button
                      key={item.number}
                      onClick={() => {
                        handleSearchSelect({
                          id: `TRN_${item.number}`,
                          number: item.number,
                          name: item.name,
                          originStationId: item.from,
                          destinationStationId: item.to,
                          type: 'Superfast',
                          sourceProvider: 'System',
                          providerTrainId: item.number,
                          routeVersion: null,
                          createdAt: '',
                          updatedAt: '',
                        });
                        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
                        router.push(`/journey/journey_${item.number}_${today}`);
                      }}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-outline-variant bg-surface-container-lowest transition-colors text-[13px] whitespace-nowrap cursor-pointer"
                    >
                      <span className="font-mono font-medium text-on-surface tabular-nums">
                        {item.number}
                      </span>
                      <span className="text-secondary group-hover:text-on-surface">
                        {item.name}
                      </span>
                      <span className={`flex items-center gap-1 text-[11px] ${item.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`}></span>
                        {item.status}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 py-1">
                  {recentSearches.map((s) => (
                    <div
                      key={s.journeyId}
                      className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-outline-variant bg-surface-container-lowest transition-colors text-[13px] whitespace-nowrap pr-7"
                    >
                      <Link href={`/journey/${s.journeyId}`} className="flex items-center gap-2">
                        <span className="font-mono font-medium text-on-surface tabular-nums">
                          {s.number}
                        </span>
                        <span className="text-secondary group-hover:text-on-surface">
                          {s.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-text-tertiary font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600"></span>
                          Track
                        </span>
                      </Link>
                      <button
                        onClick={() => {
                          const updated = recentSearches.filter(
                            (r) => r.journeyId !== s.journeyId
                          );
                          setRecentSearches(updated);
                          localStorage.setItem(
                            'exprest_recent_searches',
                            JSON.stringify(updated)
                          );
                        }}
                        className="absolute right-2 text-text-tertiary hover:text-on-surface opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Dynamic Favorite / Saved Trains ── */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[16px] font-semibold tracking-tight text-on-surface">
                  Favorite Trains
                </h2>
                <span className="text-[11px] font-mono text-text-tertiary border border-border px-1.5 py-0.5 rounded bg-surface-container">
                  {favoriteTrains.length} {favoriteTrains.length === 1 ? 'pinned' : 'pinned'}
                </span>
              </div>
              <Link
                href="/saved"
                className="text-[13px] text-secondary hover:text-on-surface font-normal transition-colors flex items-center gap-1"
              >
                <span>Manage</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            </div>

            {/* Train cards - Dynamically rendered from searched/saved trains */}
            <div className="bg-surface-container-lowest border border-border rounded-xl divide-y divide-border overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              {favoriteTrains.length === 0 ? (
                <div className="p-8 text-center text-secondary">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-2 text-text-tertiary">
                    <span className="material-symbols-outlined text-[22px]">train</span>
                  </div>
                  <div className="text-[14px] font-medium text-on-surface">No saved trains yet</div>
                  <div className="text-[12px] text-text-tertiary mt-1">
                    Search any train on the left to pin it here automatically.
                  </div>
                </div>
              ) : (
                favoriteTrains.map((train) => (
                  <div
                    key={train.number}
                    className="p-4 hover:bg-surface-container/60 transition-colors group/card relative"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                      {/* Left: identifiers */}
                      <div className="min-w-[210px]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[14px] font-semibold tabular-nums text-on-surface">
                            {train.number}
                          </span>
                          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
                            {train.type}
                          </span>
                        </div>
                        <div className="text-[14px] text-on-surface font-medium truncate max-w-[220px]">
                          {train.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] font-mono text-secondary mt-0.5">
                          <span className="font-medium text-on-surface">{train.from}</span>
                          <span className="text-text-tertiary">→</span>
                          <span className="font-medium text-on-surface">{train.to}</span>
                        </div>
                      </div>

                      {/* Center: telemetry grid */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center py-1">
                        <div>
                          <span className="block text-[11px] text-text-tertiary uppercase tracking-wider">
                            Status
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 text-[13px] font-medium mt-0.5 ${statusColor(train.status)}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusDot(train.status)}`}
                            ></span>
                            {train.statusLabel}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-text-tertiary uppercase tracking-wider">
                            {train.status === 'delayed' ? 'Next Halt' : 'Sector'}
                          </span>
                          <span
                            className="block text-[13px] text-on-surface font-normal truncate mt-0.5"
                            title={train.sector}
                          >
                            {train.sector}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-text-tertiary uppercase tracking-wider">
                            Live Speed
                          </span>
                          <span className="block text-[13px] font-mono tabular-nums text-on-surface mt-0.5">
                            {train.speed}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-text-tertiary uppercase tracking-wider">
                            {train.status === 'boarding' ? 'Platform / Dep' : 'Platform / ETA'}
                          </span>
                          <div className="text-[13px] text-on-surface mt-0.5">
                            <span className="font-medium">{train.platform}</span>
                            <span className="text-text-tertiary font-mono tabular-nums text-[12px] ml-1">
                              {train.eta}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: action buttons */}
                      <div className="flex items-center justify-end sm:pl-2 gap-2">
                        <Link
                          href={`/journey/${train.journeyId}`}
                          className="h-8 px-3 rounded-lg border border-border hover:border-outline-variant bg-surface-container-lowest text-[12px] font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-2xs"
                        >
                          <span>Open Radar</span>
                          <span className="material-symbols-outlined text-[15px] text-secondary">
                            arrow_outward
                          </span>
                        </Link>
                        <button
                          onClick={(e) => handleRemoveFavorite(train.number, e)}
                          title="Remove from favorites"
                          className="w-7 h-7 rounded-lg text-text-tertiary hover:text-danger hover:bg-surface-container flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 w-full bg-surface-container rounded-full h-[3px] overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${train.progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ==================== LIVE RADAR CTA ==================== */}
        <section className="w-full" id="radar">
          <div className="w-full rounded-xl bg-[#111113] text-white p-5 sm:p-6 border border-neutral-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
            {/* Left narrative */}
            <div className="max-w-md z-10">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>VECTOR RADAR CANVAS</span>
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight text-white mb-1.5">
                Switch to Full-Screen Live Radar
              </h3>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                Monitor real-time train clusters, speed vectors, signal holds, and section occupancy on a low-latency grid.
              </p>
            </div>

            {/* Right: teaser + button */}
            <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-5 z-10">
              <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-neutral-300">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Spatial Radar</span>
                </div>
                <span className="text-neutral-600">/</span>
                <span>MapLibre GL Engine</span>
              </div>
              <button
                onClick={() => {
                  const targetJourney = favoriteTrains[0]?.journeyId || `journey_12951_${getTodayIst()}`;
                  router.push(`/journey/${targetJourney}`);
                }}
                className="h-9 px-4 rounded-lg bg-white hover:bg-neutral-100 text-[#111113] text-[13px] font-medium flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">satellite_alt</span>
                <span>Launch Live Radar</span>
              </button>
            </div>

            {/* Background dot grid */}
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          </div>
        </section>
      </main>

      {/* ==================== FOOTER ==================== */}
      <footer className="w-full bg-surface-container-lowest border-t border-border mt-auto">
        <div className="w-full max-w-6xl mx-auto px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-text-tertiary">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-on-surface">
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
              <span className="font-medium text-[12px]">Rail Telemetry Engine Active</span>
            </div>
            <span className="text-border">|</span>
            <span className="font-mono text-[11px]">RailRadar Feed Integration</span>
            <span className="text-border">|</span>
            <span className="font-mono text-[11px]">MapLibre Vector Tiles</span>
          </div>
          <div className="flex items-center gap-5 text-[12px]">
            <Link className="hover:text-on-surface transition-colors" href="/saved">Saved Trains</Link>
            <Link className="hover:text-on-surface transition-colors" href="/settings">Settings</Link>
            <Link className="hover:text-on-surface transition-colors" href="/pnr-status">PNR Status</Link>
            <span className="font-mono text-[11px] text-neutral-400">Exprest Core v2.4.1</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
