'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { getTodayIST } from './dateUtils';
import { SortCriteria } from './types';

export interface SearchFormData {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  date: string;
  travelClass: string;
}

interface AlternativesSearchCardProps {
  initialData: SearchFormData;
  isLoading: boolean;
  onSearch: (data: SearchFormData) => void;
  activeSort: SortCriteria;
  onSortChange: (sort: SortCriteria) => void;
  maxFareBudget?: number;
}

interface StationSuggestion {
  code: string;
  name: string;
  city?: string;
  state?: string;
}

const DEFAULT_STATIONS: StationSuggestion[] = [
  { code: 'BZA', name: 'Vijayawada Junction', city: 'Vijayawada', state: 'Andhra Pradesh' },
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai', state: 'Tamil Nadu' },
  { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow', state: 'Uttar Pradesh' },
  { code: 'NDLS', name: 'New Delhi', city: 'New Delhi', state: 'Delhi' },
  { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata', state: 'West Bengal' },
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', city: 'Mumbai', state: 'Maharashtra' },
  { code: 'SBC', name: 'KSR Bengaluru City', city: 'Bengaluru', state: 'Karnataka' },
  { code: 'NGP', name: 'Nagpur Junction', city: 'Nagpur', state: 'Maharashtra' },
  { code: 'BPL', name: 'Bhopal Junction', city: 'Bhopal', state: 'Madhya Pradesh' },
  { code: 'VGLJ', name: 'V Lakshmibai Jhansi', city: 'Jhansi', state: 'Uttar Pradesh' },
  { code: 'SC', name: 'Secunderabad Junction', city: 'Hyderabad', state: 'Telangana' },
  { code: 'PNBE', name: 'Patna Junction', city: 'Patna', state: 'Bihar' },
  { code: 'ADI', name: 'Ahmedabad Junction', city: 'Ahmedabad', state: 'Gujarat' },
];

export const AlternativesSearchCard: React.FC<AlternativesSearchCardProps> = ({
  initialData,
  isLoading,
  onSearch,
  activeSort,
  onSortChange,
  maxFareBudget = 3500,
}) => {
  const [originInput, setOriginInput] = useState(
    initialData.originName
      ? `${initialData.originName} (${initialData.originCode})`
      : initialData.originCode || ''
  );
  const [originCode, setOriginCode] = useState(initialData.originCode || '');
  const [originName, setOriginName] = useState(initialData.originName || '');

  const [destInput, setDestInput] = useState(
    initialData.destinationName
      ? `${initialData.destinationName} (${initialData.destinationCode})`
      : initialData.destinationCode || ''
  );
  const [destCode, setDestCode] = useState(initialData.destinationCode || '');
  const [destName, setDestName] = useState(initialData.destinationName || '');

  const [date, setDate] = useState(initialData.date || getTodayIST());
  const [travelClass, setTravelClass] = useState(initialData.travelClass || 'ALL');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync internal form state when initialData changes
  useEffect(() => {
    setOriginCode(initialData.originCode || '');
    setOriginName(initialData.originName || '');
    setOriginInput(
      initialData.originName
        ? `${initialData.originName} (${initialData.originCode})`
        : initialData.originCode || ''
    );
    setDestCode(initialData.destinationCode || '');
    setDestName(initialData.destinationName || '');
    setDestInput(
      initialData.destinationName
        ? `${initialData.destinationName} (${initialData.destinationCode})`
        : initialData.destinationCode || ''
    );
    if (initialData.date) setDate(initialData.date);
    if (initialData.travelClass) setTravelClass(initialData.travelClass);
  }, [initialData]);

  // Suggestions state
  const [originSuggestions, setOriginSuggestions] = useState<StationSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<StationSuggestion[]>([]);
  const [showOriginMenu, setShowOriginMenu] = useState(false);
  const [showDestMenu, setShowDestMenu] = useState(false);

  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (originRef.current && !originRef.current.contains(e.target as Node)) {
        setShowOriginMenu(false);
      }
      if (destRef.current && !destRef.current.contains(e.target as Node)) {
        setShowDestMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions for Origin
  useEffect(() => {
    if (!showOriginMenu) return;
    const q = originInput.trim();
    if (q.length < 2) {
      setOriginSuggestions(DEFAULT_STATIONS.slice(0, 6));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<any>(
          `/api/v1/stations/search?q=${encodeURIComponent(q)}`,
          { timeoutMs: 4000 }
        );
        const stations: StationSuggestion[] = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.stations)
          ? res.stations
          : Array.isArray(res)
          ? res
          : [];

        if (stations.length > 0) {
          setOriginSuggestions(stations);
        } else {
          // Local fallback filter
          const filtered = DEFAULT_STATIONS.filter(
            (s) =>
              s.code.toLowerCase().includes(q.toLowerCase()) ||
              s.name.toLowerCase().includes(q.toLowerCase()) ||
              s.city?.toLowerCase().includes(q.toLowerCase())
          );
          setOriginSuggestions(filtered);
        }
      } catch {
        const filtered = DEFAULT_STATIONS.filter(
          (s) =>
            s.code.toLowerCase().includes(q.toLowerCase()) ||
            s.name.toLowerCase().includes(q.toLowerCase())
        );
        setOriginSuggestions(filtered);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [originInput, showOriginMenu]);

  // Fetch suggestions for Destination
  useEffect(() => {
    if (!showDestMenu) return;
    const q = destInput.trim();
    if (q.length < 2) {
      setDestSuggestions(DEFAULT_STATIONS.slice(0, 6));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<any>(
          `/api/v1/stations/search?q=${encodeURIComponent(q)}`,
          { timeoutMs: 4000 }
        );
        const stations: StationSuggestion[] = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.stations)
          ? res.stations
          : Array.isArray(res)
          ? res
          : [];

        if (stations.length > 0) {
          setDestSuggestions(stations);
        } else {
          const filtered = DEFAULT_STATIONS.filter(
            (s) =>
              s.code.toLowerCase().includes(q.toLowerCase()) ||
              s.name.toLowerCase().includes(q.toLowerCase()) ||
              s.city?.toLowerCase().includes(q.toLowerCase())
          );
          setDestSuggestions(filtered);
        }
      } catch {
        const filtered = DEFAULT_STATIONS.filter(
          (s) =>
            s.code.toLowerCase().includes(q.toLowerCase()) ||
            s.name.toLowerCase().includes(q.toLowerCase())
        );
        setDestSuggestions(filtered);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [destInput, showDestMenu]);

  const handleSelectOrigin = (st: StationSuggestion) => {
    setOriginCode(st.code);
    setOriginName(st.name);
    setOriginInput(`${st.name} (${st.code})`);
    setShowOriginMenu(false);
    setValidationError(null);
  };

  const handleSelectDest = (st: StationSuggestion) => {
    setDestCode(st.code);
    setDestName(st.name);
    setDestInput(`${st.name} (${st.code})`);
    setShowDestMenu(false);
    setValidationError(null);
  };

  const [isSwapping, setIsSwapping] = useState(false);

  const handleSwap = () => {
    setIsSwapping(true);
    setTimeout(() => setIsSwapping(false), 300);

    const tempCode = originCode;
    const tempName = originName;
    const tempInput = originInput;

    setOriginCode(destCode);
    setOriginName(destName);
    setOriginInput(destInput);

    setDestCode(tempCode);
    setDestName(tempName);
    setDestInput(tempInput);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Extract code if user typed directly
    let finalOrigin = originCode;
    if (!finalOrigin) {
      const match = originInput.match(/\b([A-Z]{2,5})\b/i);
      finalOrigin = match ? match[1].toUpperCase() : originInput.trim().toUpperCase();
    }

    let finalDest = destCode;
    if (!finalDest) {
      const match = destInput.match(/\b([A-Z]{2,5})\b/i);
      finalDest = match ? match[1].toUpperCase() : destInput.trim().toUpperCase();
    }

    if (!finalOrigin || !finalDest) {
      setValidationError('Please specify both an origin and destination station.');
      return;
    }

    if (finalOrigin === finalDest) {
      setValidationError('Origin and destination stations cannot be the same station.');
      return;
    }

    setValidationError(null);

    onSearch({
      originCode: finalOrigin,
      originName: originName || finalOrigin,
      destinationCode: finalDest,
      destinationName: destName || finalDest,
      date,
      travelClass,
    });
  };

  return (
    <div className="w-full rounded-2xl bg-surface border border-border p-4 sm:p-6 shadow-sm">
      <form onSubmit={handleSubmit}>
        {validationError && (
          <div className="mb-3.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            <span>{validationError}</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          {/* Origin Station */}
          <div className="md:col-span-3 flex flex-col gap-1.5 relative" ref={originRef}>
            <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>Origin Station</span>
              <span className="text-[10px] text-text-tertiary">Intended Boarding</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-text-secondary text-[18px]">
                trip_origin
              </span>
              <input
                type="text"
                value={originInput}
                onChange={(e) => {
                  setOriginInput(e.target.value);
                  setOriginCode('');
                }}
                onFocus={() => setShowOriginMenu(true)}
                placeholder="Station name or code (e.g. BZA)"
                autoComplete="off"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-surface-container-low border border-border text-sm font-semibold text-text focus:outline-none focus:border-text focus:bg-surface transition-colors"
              />
            </div>

            {/* Origin Autocomplete Dropdown */}
            {showOriginMenu && originSuggestions.length > 0 && (
              <div className="absolute top-[68px] left-0 w-full bg-surface border border-border rounded-xl shadow-lg z-30 p-1.5 max-h-60 overflow-y-auto">
                {originSuggestions.map((st) => (
                  <button
                    key={`orig-${st.code}`}
                    type="button"
                    onClick={() => handleSelectOrigin(st)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-surface-container flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-text">{st.name}</div>
                      <div className="text-[10px] text-text-secondary">
                        {st.city ? `${st.city}, ` : ''}{st.state || ''}
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[11px] font-mono font-bold text-text">
                      {st.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="md:col-span-1 flex items-center justify-center pb-1">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap origin and destination stations"
              className={`w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border flex items-center justify-center text-text transition-transform ${
                isSwapping ? 'rotate-180 duration-300' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
            </button>
          </div>

          {/* Destination Station */}
          <div className="md:col-span-3 flex flex-col gap-1.5 relative" ref={destRef}>
            <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>Destination Station</span>
              <span className="text-[10px] text-text-tertiary">Final Terminal</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-text-secondary text-[18px]">
                location_on
              </span>
              <input
                type="text"
                value={destInput}
                onChange={(e) => {
                  setDestInput(e.target.value);
                  setDestCode('');
                }}
                onFocus={() => setShowDestMenu(true)}
                placeholder="Station name or code (e.g. LKO)"
                autoComplete="off"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-surface-container-low border border-border text-sm font-semibold text-text focus:outline-none focus:border-text focus:bg-surface transition-colors"
              />
            </div>

            {/* Destination Autocomplete Dropdown */}
            {showDestMenu && destSuggestions.length > 0 && (
              <div className="absolute top-[68px] left-0 w-full bg-surface border border-border rounded-xl shadow-lg z-30 p-1.5 max-h-60 overflow-y-auto">
                {destSuggestions.map((st) => (
                  <button
                    key={`dest-${st.code}`}
                    type="button"
                    onClick={() => handleSelectDest(st)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-surface-container flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-text">{st.name}</div>
                      <div className="text-[10px] text-text-secondary">
                        {st.city ? `${st.city}, ` : ''}{st.state || ''}
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[11px] font-mono font-bold text-text">
                      {st.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Picker (IST today minimum) */}
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Travel Date (IST)
            </label>
            <div className="relative flex items-center">
              <input
                type="date"
                min={getTodayIST()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-border text-xs sm:text-sm font-semibold text-text focus:outline-none focus:border-text focus:bg-surface transition-colors"
              />
            </div>
          </div>

          {/* Travel Class & Search Button */}
          <div className="md:col-span-3 flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Class</label>
              <select
                value={travelClass}
                onChange={(e) => setTravelClass(e.target.value)}
                className="w-full h-11 px-2.5 rounded-xl bg-surface-container-low border border-border text-xs sm:text-sm font-semibold text-text focus:outline-none focus:border-text focus:bg-surface transition-colors"
              >
                <option value="ALL">All Classes</option>
                <option value="3A">AC 3 Tier (3A)</option>
                <option value="2A">AC 2 Tier (2A)</option>
                <option value="1A">AC First Class (1A)</option>
                <option value="3E">AC 3 Economy (3E)</option>
                <option value="SL">Sleeper (SL)</option>
                <option value="CC">AC Chair Car (CC)</option>
                <option value="EC">Exec Chair Car (EC)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold invisible">Submit</span>
              <button
                type="submit"
                disabled={isLoading}
                className="h-11 px-4 sm:px-5 rounded-xl bg-text text-bg hover:opacity-90 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm shrink-0 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">
                      progress_activity
                    </span>
                    <span className="hidden sm:inline">Searching...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">travel_explore</span>
                    <span>Find</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Search Settings & Quick Sorter Pills */}
        <div className="mt-4 pt-3.5 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low border border-border">
              <span className="material-symbols-outlined text-[15px]">group</span>
              <span>1-2 Passengers</span>
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low border border-border">
              <span className="material-symbols-outlined text-[15px]">tune</span>
              <span>Budget &lt; ₹{maxFareBudget.toLocaleString('en-IN')}</span>
            </span>
          </div>

          {/* Priority Sorter Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Sort options">
            <span className="text-[11px] font-bold uppercase text-text-tertiary mr-1 hidden sm:inline">
              Priority:
            </span>
            {(
              [
                { id: 'best', label: 'Best Alternative' },
                { id: 'cheapest', label: 'Cheapest' },
                { id: 'fastest', label: 'Fastest' },
                { id: 'earliest', label: 'Earliest Arrival' },
                { id: 'transfers', label: 'Fewest Transfers' },
              ] as const
            ).map((sorter) => {
              const isActive = activeSort === sorter.id;
              return (
                <button
                  key={sorter.id}
                  type="button"
                  onClick={() => onSortChange(sorter.id)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                    isActive
                      ? 'font-bold bg-text text-bg shadow-sm'
                      : 'font-medium bg-surface-container-low hover:bg-surface-container text-text-secondary hover:text-text'
                  }`}
                >
                  {sorter.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
};
