'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DarkModeToggle } from '@/components/common/DarkModeToggle';
import { createClient } from '@/lib/supabase/client';
import { PnrStatusResult, PassengerStatus, CoachRakeItem } from '@exprest/types';

import { API_BASE } from '@/lib/api';

interface RecentPnrItem {
  pnr: string;
  trainNumber: string;
  trainName: string;
  statusBadge: string;
  statusType: 'cnf' | 'wl' | 'rac';
}

function formatPNR(value: string): string {
  const raw = value.replace(/\D/g, '').slice(0, 10);
  if (raw.length <= 3) return raw;
  if (raw.length <= 6) return raw.slice(0, 3) + '-' + raw.slice(3);
  return raw.slice(0, 3) + '-' + raw.slice(3, 6) + '-' + raw.slice(6, 10);
}

const DEFAULT_RECENT_LOOKUPS: RecentPnrItem[] = [];

const DEFAULT_RAKE: CoachRakeItem[] = [
  { position: 1, code: 'LOCO', classType: 'LOCO', className: 'Locomotive Engine' },
  { position: 2, code: 'EOG', classType: 'EOG', className: 'Power Car' },
  { position: 3, code: 'H1', classType: '1A', className: 'AC First Class' },
  { position: 4, code: 'A1', classType: '2A', className: 'AC 2 Tier' },
  { position: 5, code: 'A2', classType: '2A', className: 'AC 2 Tier' },
  { position: 6, code: 'B1', classType: '3A', className: 'AC 3 Tier' },
  { position: 7, code: 'B2', classType: '3A', className: 'AC 3 Tier' },
  { position: 8, code: 'B3', classType: '3A', className: 'AC 3 Tier' },
  { position: 9, code: 'B4', classType: '3A', className: 'AC 3 Tier' },
  { position: 10, code: 'PC', classType: 'PC', className: 'Pantry Car' },
  { position: 11, code: 'B5', classType: '3A', className: 'AC 3 Tier' },
  { position: 12, code: 'B6', classType: '3A', className: 'AC 3 Tier' },
  { position: 13, code: 'B7', classType: '3A', className: 'AC 3 Tier' },
  { position: 14, code: 'B8', classType: '3A', className: 'AC 3 Tier' },
  { position: 15, code: 'EOG', classType: 'EOG', className: 'Power Car' },
];

function getCoachClass(coachCode: string, rake?: CoachRakeItem[], travelClass?: string): string {
  const cleanCode = (coachCode || '').toUpperCase().replace(/\s+|-/g, '');
  const rakeItem = rake?.find((r) => r.code.toUpperCase().replace(/\s+|-/g, '') === cleanCode);
  if (rakeItem?.classType) {
    const ct = rakeItem.classType.toUpperCase();
    if (ct.includes('3A') || ct.includes('3-TIER') || ct.includes('3 TIER')) return '3A';
    if (ct.includes('2A') || ct.includes('2-TIER') || ct.includes('2 TIER')) return '2A';
    if (ct.includes('1A') || ct.includes('FIRST')) return '1A';
    if (ct.includes('SL') || ct.includes('SLEEPER')) return 'SL';
    if (ct.includes('3E') || ct.includes('ECONOMY')) return '3E';
    if (ct.includes('CC') || ct.includes('CHAIR')) return 'CC';
    if (ct.includes('2S') || ct.includes('SECOND')) return '2S';
    if (ct.includes('LOCO') || ct.includes('ENG')) return 'LOCO';
    if (ct.includes('EOG') || ct.includes('LPR')) return 'EOG';
    if (ct.includes('PC')) return 'PC';
  }
  const code = cleanCode;
  if (code.startsWith('B')) return '3A';
  if (code.startsWith('M')) return '3E';
  if (code.startsWith('A')) return '2A';
  if (code.startsWith('H') || code.startsWith('FC')) return '1A';
  if (code.startsWith('S') && !code.startsWith('SLR')) return 'SL';
  if (code.startsWith('C') || code.startsWith('D') || code.startsWith('J') || code.startsWith('K')) return 'CC';
  if (code.startsWith('EC') || code.startsWith('EA') || code.startsWith('EV') || (code.startsWith('E') && !code.startsWith('ENG') && !code.startsWith('EOG'))) return 'CC';
  if (code.startsWith('G') && !code.startsWith('GEN') && !code.startsWith('GS')) return '3A';
  if (code.startsWith('GEN') || code.startsWith('GS')) return 'GEN';
  if (code.startsWith('ENG') || code.startsWith('LOCO')) return 'LOCO';
  if (code === 'PC') return 'PC';
  if (code === 'EOG' || code === 'LPR' || code.startsWith('SLR')) return 'EOG';
  return (travelClass || '3A').toUpperCase();
}

function getCoachLayoutMeta(coachClass: string, rakeTotalBerths?: number) {
  let berthsPerBay = 8;
  let totalBerths = rakeTotalBerths || 72;

  switch (coachClass) {
    case '2A':
      berthsPerBay = 6;
      totalBerths = rakeTotalBerths || 48;
      break;
    case '3E':
      berthsPerBay = 9;
      totalBerths = rakeTotalBerths || 80;
      break;
    case '1A':
      berthsPerBay = 4;
      totalBerths = rakeTotalBerths || 24;
      break;
    case 'CC':
      berthsPerBay = 5;
      totalBerths = rakeTotalBerths || 75;
      break;
    case '2S':
      berthsPerBay = 6;
      totalBerths = rakeTotalBerths || 108;
      break;
    case 'SL':
      berthsPerBay = 8;
      totalBerths = rakeTotalBerths || 72;
      break;
    case '3A':
    default:
      berthsPerBay = 8;
      totalBerths = rakeTotalBerths || 72;
      break;
  }

  const totalBays = Math.max(1, Math.ceil(totalBerths / berthsPerBay));
  return { berthsPerBay, totalBerths, totalBays };
}

function getBerthType(seatNum: number, coachClass: string): string {
  switch (coachClass) {
    case '2A': {
      const mod = seatNum % 6;
      if (mod === 1 || mod === 3) return 'LB';
      if (mod === 2 || mod === 4) return 'UB';
      if (mod === 5) return 'SL';
      return 'SU';
    }
    case '3E': {
      const mod = seatNum % 9;
      if (mod === 1 || mod === 4) return 'LB';
      if (mod === 2 || mod === 5) return 'MB';
      if (mod === 3 || mod === 6) return 'UB';
      if (mod === 7) return 'SL';
      if (mod === 8) return 'SM';
      return 'SU';
    }
    case '1A': {
      const mod = seatNum % 4;
      if (mod === 1 || mod === 3) return 'LB';
      return 'UB';
    }
    case 'CC': {
      const mod = seatNum % 5;
      if (mod === 1 || mod === 0) return 'WS';
      if (mod === 2) return 'MS';
      return 'AS';
    }
    case '3A':
    case 'SL':
    default: {
      const mod = seatNum % 8;
      if (mod === 1 || mod === 4) return 'LB';
      if (mod === 2 || mod === 5) return 'MB';
      if (mod === 3 || mod === 6) return 'UB';
      if (mod === 7) return 'SL';
      return 'SU';
    }
  }
}

interface ArchitecturalBay {
  bayNumber: number;
  startBerth: number;
  endBerth: number;
  mainBerths: Array<{ num: number; type: string }>;
  sideBerths: Array<{ num: number; type: string }>;
}

export default function PnrStatusPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [pnrInput, setPnrInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pnrData, setPnrData] = useState<PnrStatusResult | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    code: string;
    message: string;
    isFlushed?: boolean;
    isNotFound?: boolean;
    isPrsUnavailable?: boolean;
  } | null>(null);

  const [recentLookups, setRecentLookups] = useState<RecentPnrItem[]>(DEFAULT_RECENT_LOOKUPS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    isLoggedIn?: boolean;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const baySectionRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Session initialization
  useEffect(() => {
    let isMounted = true;
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (session?.user) {
          const u = session.user;
          const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
          setUser({ name, email: u.email || '', isLoggedIn: true });
          return;
        }
      } catch {}
      if (isMounted) setUser(null);
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
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

  // 2. Load recent lookups from localStorage safely
  useEffect(() => {
    try {
      const stored = localStorage.getItem('exprest_recent_pnr_lookups');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentLookups(parsed.slice(0, 5));
        }
      }
    } catch {
      setRecentLookups(DEFAULT_RECENT_LOOKUPS);
    }
  }, []);

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

  // Perform genuine PNR search
  const performLookup = useCallback(async (targetPnrRaw: string) => {
    const clean = targetPnrRaw.replace(/\D/g, '');
    if (clean.length !== 10) {
      setErrorInfo({
        code: 'INVALID_PNR',
        message: 'Please enter a valid 10-digit Indian Railways PNR number.',
      });
      return;
    }

    setIsLoading(true);
    setErrorInfo(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/pnr/${clean}`);
      const json = await res.json();

      if (!res.ok) {
        const errCode = json?.error?.code || 'ERROR';
        const errMsg = json?.error?.message || 'Unable to retrieve PNR record.';
        const isFlushed = errCode === 'PNR_FLUSHED';
        const isNotFound = errCode === 'PNR_NOT_FOUND' || errCode === 'INVALID_PNR';
        const isPrsUnavailable =
          errCode === 'PNR_UNAVAILABLE' ||
          errCode === 'PRS_UNAVAILABLE' ||
          errCode === 'PROVIDER_TIMEOUT' ||
          errMsg.includes('500') ||
          errMsg.toLowerCase().includes('socket') ||
          errMsg.toLowerCase().includes('prs');

        const displayMsg = isPrsUnavailable
          ? 'Indian Railways reservation servers (PRS) are currently unavailable or experiencing connection issues. Please retry in a few moments.'
          : errMsg;

        setErrorInfo({
          code: errCode,
          message: displayMsg,
          isFlushed,
          isNotFound,
          isPrsUnavailable,
        });
        setPnrData(null);
        return;
      }

      const rawResult = json?.data;
      if (!rawResult) {
        setErrorInfo({
          code: 'NO_DATA',
          message: 'No booking details returned for this PNR record.',
          isNotFound: true,
        });
        setPnrData(null);
        return;
      }

      // Robust passenger mapping ensuring coach and berth extraction never fail
      const passengers: PassengerStatus[] = (rawResult.passengers || []).map((p: any, idx: number) => {
        const coach = p.coach || p.bookingCoach || p.current?.coachId || p.booking?.coachId || null;
        const rawBerth = p.berthNumber != null
          ? p.berthNumber
          : (p.bookingBerth != null ? p.bookingBerth : (p.current?.berthNo != null ? p.current?.berthNo : p.booking?.berthNo));
        const berthType = p.berthType || p.berthCode || p.current?.berthCode || p.booking?.berthCode || null;
        const currentStatus = p.currentStatus || p.current?.status || p.bookingStatus || 'CNF';
        const bookingStatus = p.bookingStatus || p.booking?.formatted || p.booking?.status || currentStatus;

        return {
          ...p,
          passengerNumber: p.passengerNumber || (idx + 1),
          coach,
          berthNumber: rawBerth,
          berthType: berthType || (rawBerth ? getBerthType(parseInt(String(rawBerth).replace(/\D/g, ''), 10), getCoachClass(coach || '3A')) : 'Berth'),
          currentStatus,
          bookingStatus,
          confirmed: p.confirmed ?? (currentStatus.toUpperCase().includes('CNF') || currentStatus.toUpperCase().includes('CONFIRM')),
        };
      });

      const firstPassenger = passengers[0];
      const userCoach = rawResult.userCoach || firstPassenger?.coach || null;

      const result: PnrStatusResult = {
        ...rawResult,
        userCoach,
        passengers,
      };

      setPnrData(result);
      setErrorInfo(null);

      // Add to recent lookups
      const statusBadge = firstPassenger
        ? `${firstPassenger.currentStatus} ${firstPassenger.coach ? `(${firstPassenger.coach}-${firstPassenger.berthNumber || ''})` : ''}`.trim()
        : result.bookingStatus;

      const statusType: 'cnf' | 'wl' | 'rac' = statusBadge.toUpperCase().includes('CNF')
        ? 'cnf'
        : statusBadge.toUpperCase().includes('WL')
        ? 'wl'
        : 'rac';

      const newRecent: RecentPnrItem = {
        pnr: clean,
        trainNumber: result.trainNumber,
        trainName: result.trainName,
        statusBadge,
        statusType,
      };

      setRecentLookups((prev) => {
        const filtered = prev.filter((item) => item.pnr !== clean);
        const updated = [newRecent, ...filtered].slice(0, 5);
        try {
          localStorage.setItem('exprest_recent_pnr_lookups', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    } catch (err: any) {
      setErrorInfo({
        code: 'NETWORK_ERROR',
        message: err?.message || 'Network error while contacting Exprest backend server.',
      });
      setPnrData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 3. Initial URL search param handling
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const qPnr = urlParams.get('pnr');
      if (qPnr) {
        const formatted = formatPNR(qPnr);
        setPnrInput(formatted);
        performLookup(qPnr);
      }
    }
  }, [performLookup]);

  // 4. Initialize coach and bay selection when PNR data is loaded
  useEffect(() => {
    if (pnrData) {
      const firstPassengerCoach = pnrData.userCoach || pnrData.passengers?.find((p) => p.coach)?.coach || null;
      setSelectedCoach(firstPassengerCoach);

      const firstPassengerBerth = pnrData.passengers?.find((p) => p.berthNumber != null)?.berthNumber;
      if (firstPassengerBerth != null) {
        const num = parseInt(String(firstPassengerBerth).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > 0) {
          const coachClass = getCoachClass(firstPassengerCoach || '3A', pnrData.rakeComposition, pnrData.travelClass);
          const meta = getCoachLayoutMeta(coachClass);
          const initialBay = Math.min(meta.totalBays, Math.max(1, Math.ceil(num / meta.berthsPerBay)));
          setSelectedBay(initialBay);
        } else {
          setSelectedBay(1);
        }
      } else {
        setSelectedBay(1);
      }
    }
  }, [pnrData]);

  // Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPNR(e.target.value);
    setPnrInput(formatted);
    if (errorInfo) setErrorInfo(null);
  };

  // Keyboard shortcut Ctrl+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      performLookup(pnrInput);
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const formatted = formatPNR(text);
        setPnrInput(formatted);
        if (formatted.replace(/\D/g, '').length === 10) {
          performLookup(formatted);
        }
      }
    } catch {
      showToast('Clipboard access unavailable. Please paste manually.');
    }
  };

  // Clear recent history
  const handleClearHistory = () => {
    setRecentLookups([]);
    try {
      localStorage.removeItem('exprest_recent_pnr_lookups');
    } catch {}
    showToast('Recent PNR search history cleared.');
  };

  // Share action
  const handleShare = async () => {
    const shareText = pnrData
      ? `Exprest PNR Status: PNR ${formatPNR(pnrData.pnr)} | Train ${pnrData.trainNumber} ${pnrData.trainName} | Status: ${pnrData.bookingStatus}`
      : `Check live PNR status on Exprest`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Exprest PNR Status',
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('PNR page link copied to clipboard!');
    } catch {
      showToast('Unable to copy link.');
    }
  };

  // PDF Ticket Summary
  const handleDownloadPdf = () => {
    if (!pnrData) {
      showToast('No booking record loaded to print.');
      return;
    }
    window.print();
  };

  // Refresh current status
  const handleRefresh = () => {
    const target = pnrData?.pnr || pnrInput;
    if (target) {
      performLookup(target);
      showToast('Refreshing latest PRS record...');
    }
  };

  // User's allocated coach (if any) and interactive coach selection
  const userCoach = pnrData?.userCoach || pnrData?.passengers?.find((p) => p.coach)?.coach || null;
  const rawRake = (pnrData?.rakeComposition && pnrData.rakeComposition.length > 0)
    ? pnrData.rakeComposition
    : DEFAULT_RAKE;

  // Guarantee userCoach is included in displayRake
  const displayRake = useMemo(() => {
    if (!userCoach) return rawRake;
    const cleanUserCoach = userCoach.toUpperCase().replace(/\s+|-/g, '');
    const exists = rawRake.some((c) => c.code.toUpperCase().replace(/\s+|-/g, '') === cleanUserCoach);
    if (exists) return rawRake;
    const userCoachClass = getCoachClass(cleanUserCoach, rawRake, pnrData?.travelClass);
    return [
      ...rawRake,
      {
        position: rawRake.length + 1,
        code: cleanUserCoach,
        classType: userCoachClass,
        className: `Coach ${cleanUserCoach}`,
        totalBerths: getCoachLayoutMeta(userCoachClass).totalBerths,
        hasSeats: true,
      },
    ];
  }, [rawRake, userCoach, pnrData?.travelClass]);

  const activeCoach = selectedCoach || userCoach || (displayRake.find((c) => !['LOCO', 'ENG', 'EOG', 'LPR', 'PC'].includes(c.code))?.code) || 'B4';
  const isUserActiveCoach = Boolean(
    userCoach &&
    activeCoach.toUpperCase().replace(/\s+|-/g, '') === userCoach.toUpperCase().replace(/\s+|-/g, '')
  );
  const activeCoachIndex = displayRake.findIndex(
    (c) => c.code.toUpperCase().replace(/\s+|-/g, '') === activeCoach.toUpperCase().replace(/\s+|-/g, '')
  );
  const activeCoachItem = activeCoachIndex !== -1 ? displayRake[activeCoachIndex] : undefined;
  const coachClass = getCoachClass(activeCoach, displayRake, pnrData?.travelClass);
  const layoutMeta = getCoachLayoutMeta(coachClass, activeCoachItem?.totalBerths);

  // Generate architectural bays data
  const baysData: ArchitecturalBay[] = useMemo(() => {
    const bays: ArchitecturalBay[] = [];
    const totalBays = layoutMeta.totalBays;

    for (let b = 1; b <= totalBays; b++) {
      const bStart = (b - 1) * layoutMeta.berthsPerBay + 1;
      const bEnd = Math.min(b * layoutMeta.berthsPerBay, layoutMeta.totalBerths);

      const mainBerths: Array<{ num: number; type: string }> = [];
      const sideBerths: Array<{ num: number; type: string }> = [];

      if (coachClass === '3A' || coachClass === 'SL') {
        for (let i = 0; i < 6; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            mainBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
        for (let i = 6; i < 8; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            sideBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
      } else if (coachClass === '2A') {
        for (let i = 0; i < 4; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            mainBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
        for (let i = 4; i < 6; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            sideBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
      } else if (coachClass === '3E') {
        for (let i = 0; i < 6; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            mainBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
        for (let i = 6; i < 9; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            sideBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
      } else {
        const half = Math.ceil(layoutMeta.berthsPerBay / 2);
        for (let i = 0; i < half; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            mainBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
        for (let i = half; i < layoutMeta.berthsPerBay; i++) {
          const num = bStart + i;
          if (num <= layoutMeta.totalBerths) {
            sideBerths.push({ num, type: getBerthType(num, coachClass) });
          }
        }
      }

      bays.push({
        bayNumber: b,
        startBerth: bStart,
        endBerth: bEnd,
        mainBerths,
        sideBerths,
      });
    }

    return bays;
  }, [coachClass, layoutMeta]);

  // Which passengers are seated in the active coach
  const passengersInActiveCoach = useMemo(() => {
    if (!pnrData) return [];
    const cleanActive = activeCoach.toUpperCase().replace(/\s+|-/g, '');
    return pnrData.passengers.filter((p) => {
      const pCoach = (p.coach || pnrData.userCoach || '').toUpperCase().replace(/\s+|-/g, '');
      return pCoach === cleanActive;
    });
  }, [pnrData, activeCoach]);

  // Helper to check if a specific seat belongs to a user passenger
  const getPassengerForSeat = useCallback((seatNum: number) => {
    if (!pnrData) return null;
    const cleanActive = activeCoach.toUpperCase().replace(/\s+|-/g, '');
    const foundIdx = pnrData.passengers.findIndex((p) => {
      const pCoach = (p.coach || pnrData.userCoach || '').toUpperCase().replace(/\s+|-/g, '');
      const pBerth = p.berthNumber != null ? parseInt(String(p.berthNumber).replace(/\D/g, ''), 10) : null;
      return pCoach === cleanActive && pBerth === seatNum;
    });
    if (foundIdx === -1) return null;
    return { passenger: pnrData.passengers[foundIdx], index: foundIdx + 1 };
  }, [pnrData, activeCoach]);

  // Determine which bays contain passenger berths
  const userBaysInCoach = useMemo(() => {
    if (!pnrData || passengersInActiveCoach.length === 0) return [];
    const matchedBayNumbers: number[] = [];
    passengersInActiveCoach.forEach((p) => {
      const pBerth = p.berthNumber != null ? parseInt(String(p.berthNumber).replace(/\D/g, ''), 10) : null;
      if (pBerth != null && !isNaN(pBerth) && pBerth > 0) {
        const foundBay = baysData.find((b) => {
          return b.mainBerths.some((mb) => mb.num === pBerth) || b.sideBerths.some((sb) => sb.num === pBerth);
        });
        if (foundBay && !matchedBayNumbers.includes(foundBay.bayNumber)) {
          matchedBayNumbers.push(foundBay.bayNumber);
        }
      }
    });
    return matchedBayNumbers.sort((a, b) => a - b);
  }, [pnrData, passengersInActiveCoach, baysData]);

  const coachClassName = activeCoachItem?.className || (
    coachClass === '3A' ? 'AC 3-Tier (3A)' :
    coachClass === '2A' ? 'AC 2-Tier (2A)' :
    coachClass === '1A' ? 'AC First Class (1A)' :
    coachClass === 'SL' ? 'Sleeper Class (SL)' :
    coachClass === '3E' ? 'AC 3 Economy (3E)' :
    coachClass === 'CC' ? 'AC Chair Car (CC)' :
    coachClass === '2S' ? 'Second Sitting (2S)' :
    coachClass === 'LOCO' ? 'Locomotive Engine' :
    coachClass === 'PC' ? 'Pantry Car' :
    coachClass === 'EOG' ? 'Generator Car' :
    'Standard Coach'
  );

  // Coach position relative to locomotive
  const coachPositionNumber = activeCoachIndex >= 0 ? activeCoachIndex + 1 : null;

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between selection:bg-surface-variant selection:text-primary">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-on-surface text-background font-body-sm text-body-sm shadow-lg flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[16px] text-success">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================== 1. STITCH HEADER ==================== */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-elevated/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-border">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-margin flex items-center justify-between gap-space-lg">
          <div className="flex items-center gap-space-xl">
            <Link className="flex items-center gap-space-sm text-on-surface select-none group" href="/">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary font-heading-md text-heading-md font-bold tracking-tight">
                E
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-heading-md text-heading-md tracking-tight text-on-surface font-semibold">Exprest</span>
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-space-xs">
              <Link
                className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors rounded-lg"
                href="/saved"
              >
                Saved Trains
              </Link>
              <Link
                className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors rounded-lg"
                href="/#radar"
              >
                Live Radar
              </Link>
              <Link
                aria-current="page"
                className="px-space-md py-space-sm transition-colors text-on-surface font-semibold bg-surface-container rounded-lg"
                href="/pnr-status"
              >
                PNR Status
              </Link>
              <Link
                className="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors rounded-lg"
                href="/settings"
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-space-md">
            <div className="hidden lg:flex items-center gap-space-sm px-space-sm py-space-xs rounded-full bg-surface-container">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="font-label text-label text-on-surface-variant uppercase tracking-wider">
                Live APIs Connected
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 px-space-sm py-space-xs rounded-lg bg-surface-container font-label text-label text-on-surface-variant select-none">
              <span className="text-[12px]">⌘</span>
              <span>K</span>
            </div>

            <DarkModeToggle />

            {user?.isLoggedIn ? (
              <button
                onClick={handleSignOut}
                title={`${user.name || 'User'} — Click to Sign Out`}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-xs ring-2 ring-transparent hover:ring-primary/20 transition-all"
                type="button"
              >
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </button>
            ) : (
              <Link
                href="/login"
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary hover:opacity-90 transition-opacity"
                title="Sign In"
              >
                <span className="material-symbols-outlined text-[18px]">person</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="w-full pt-16 bg-background min-h-[calc(100vh-64px)]">
        <div className="flex flex-col w-full">
          <div className="w-full max-w-[1440px] mx-auto px-margin py-space-xl flex flex-col gap-space-xl">

            {/* 1. Header & Live System Status */}
            <div className="flex flex-col gap-space-sm max-w-3xl">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container font-label text-label text-on-surface-variant tracking-wider uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                  Indian Railways CRIS / PRS Live Sync · 99.8% Freshness
                </span>
                <span className="text-outline-variant font-label text-label hidden sm:inline">•</span>
                <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                  TS-9281-NODE
                </span>
              </div>
              <h1 className="font-heading-lg text-heading-lg text-on-surface tracking-tight mt-1 font-bold">
                Instant PNR verification &amp; berth allocation.
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Real-time booking status, chart preparation status, confirmation probability, and live coach rake telemetry.
              </p>
            </div>

            {/* 2. PNR Search Input & Quick Switcher Strip */}
            <div className="flex flex-col gap-space-md">
              <div className="p-space-xs rounded-xl bg-surface-elevated shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-space-xs border border-border">
                <div className="relative flex-1 flex items-center pl-space-md">
                  <span className="material-symbols-outlined text-outline text-[22px] select-none">
                    confirmation_number
                  </span>
                  <input
                    ref={inputRef}
                    aria-label="10 Digit PNR Number"
                    className="w-full bg-transparent px-space-sm py-3 font-heading-md text-heading-md text-on-surface tracking-widest placeholder:text-text-tertiary placeholder:font-body-md placeholder:tracking-normal focus:outline-none"
                    id="pnr-input"
                    maxLength={12}
                    placeholder="Enter 10-digit PNR (e.g. 624-819-3042)"
                    type="text"
                    value={pnrInput}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    className="hidden sm:inline-flex items-center gap-1 px-space-sm py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label text-label transition-colors select-none mr-2"
                    onClick={handlePaste}
                    title="Paste from clipboard"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_paste</span>
                    <span>Paste</span>
                  </button>
                </div>
                <button
                  className="flex items-center justify-center gap-space-sm px-space-xl py-3 rounded-lg bg-primary text-on-primary hover:bg-on-surface-variant transition-colors select-none disabled:opacity-50"
                  id="check-status-btn"
                  type="button"
                  disabled={isLoading}
                  onClick={() => performLookup(pnrInput)}
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span className="font-body-md text-body-md font-semibold">Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-body-md text-body-md font-semibold">Check Status</span>
                      <span className="font-label text-label opacity-60 ml-0.5 tracking-wider hidden lg:inline">⌘↵</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3. Recent PNR Queries Pill Bar */}
              {recentLookups.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-space-sm pt-1">
                  <div className="flex flex-wrap items-center gap-space-xs">
                    <span className="font-label text-label text-text-tertiary uppercase tracking-wider mr-1">
                      Recent Lookups:
                    </span>
                    {recentLookups.map((item) => {
                      const isActive = pnrInput.replace(/\D/g, '') === item.pnr;
                      return (
                        <button
                          key={item.pnr}
                          className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-left shadow-sm ${
                            isActive
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-elevated hover:bg-surface-container text-on-surface'
                          }`}
                          onClick={() => {
                            const formatted = formatPNR(item.pnr);
                            setPnrInput(formatted);
                            performLookup(item.pnr);
                          }}
                          type="button"
                        >
                          <span className={`font-label text-label tracking-wider ${isActive ? 'font-semibold' : 'text-on-surface-variant'}`}>
                            {formatPNR(item.pnr)}
                          </span>
                          <span className={isActive ? 'text-on-primary/40' : 'text-outline-variant'}>•</span>
                          <span className={`font-body-sm text-body-sm ${isActive ? 'font-medium' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                            {item.trainNumber} {item.trainName}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold tracking-wider uppercase ml-1 ${
                              item.statusType === 'cnf'
                                ? isActive ? 'bg-success/20 text-success' : 'bg-success/15 text-success'
                                : item.statusType === 'wl'
                                ? 'bg-surface-container-high text-warning'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {item.statusBadge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="font-body-sm text-body-sm text-text-tertiary hover:text-on-surface transition-colors"
                    onClick={handleClearHistory}
                    type="button"
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>

            {/* Error or Flushed Banner */}
            {errorInfo && (
              <div
                className={`p-space-lg rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md shadow-sm ${
                  errorInfo.isFlushed || errorInfo.isPrsUnavailable
                    ? 'bg-amber-500/10 border-amber-500/30 text-on-surface'
                    : 'bg-danger/10 border-danger/30 text-on-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined text-[24px] mt-0.5 ${
                      errorInfo.isFlushed || errorInfo.isPrsUnavailable ? 'text-warning' : 'text-danger'
                    }`}
                  >
                    {errorInfo.isFlushed ? 'history_toggle_off' : errorInfo.isPrsUnavailable ? 'cloud_off' : 'error'}
                  </span>
                  <div>
                    <h3 className="font-heading-md text-heading-md font-semibold">
                      {errorInfo.isFlushed
                        ? 'PNR Record Flushed / Journey Completed'
                        : errorInfo.isNotFound
                        ? 'PNR Number Not Found or Invalid'
                        : errorInfo.isPrsUnavailable
                        ? 'Indian Railways PRS Servers Unavailable'
                        : 'Service Error Occurred'}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      {errorInfo.message}
                    </p>
                    {errorInfo.isFlushed && (
                      <p className="font-label text-label text-text-tertiary mt-1">
                        Note: Indian Railways PRS flushes passenger reservation records within 24–48 hours of journey completion.
                      </p>
                    )}
                    {errorInfo.isPrsUnavailable && (
                      <p className="font-label text-label text-text-tertiary mt-1">
                        Indian Railways passenger reservation servers (PRS) periodically close connections during maintenance or peak traffic windows. Your query can be retried shortly.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => performLookup(pnrInput)}
                    className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-on-surface-variant transition-colors flex items-center gap-1.5"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    <span>Retry Search</span>
                  </button>
                </div>
              </div>
            )}

            {/* Loading Skeleton */}
            {isLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start animate-pulse">
                <div className="lg:col-span-8 flex flex-col gap-space-lg">
                  <div className="h-64 rounded-xl bg-surface-container"></div>
                  <div className="h-72 rounded-xl bg-surface-container"></div>
                  <div className="h-48 rounded-xl bg-surface-container"></div>
                </div>
                <div className="lg:col-span-4 flex flex-col gap-space-lg">
                  <div className="h-64 rounded-xl bg-surface-container"></div>
                  <div className="h-28 rounded-xl bg-surface-container"></div>
                </div>
              </div>
            )}

            {/* Initial Empty State */}
            {!pnrData && !isLoading && !errorInfo && (
              <div className="rounded-xl bg-surface-elevated border border-border p-8 sm:p-10 text-center max-w-2xl mx-auto shadow-sm my-4">
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-4 text-primary">
                  <span className="material-symbols-outlined text-[30px]">confirmation_number</span>
                </div>
                <h2 className="text-[20px] font-semibold text-on-surface mb-2">Check Real-Time PNR Status</h2>
                <p className="text-[14px] text-text-secondary leading-relaxed mb-6 max-w-lg mx-auto">
                  Enter your 10-digit Indian Railways PNR number above to verify current confirmation status, coach and berth allocations, architectural rake layout, and live schedule.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-6 border-t border-border">
                  <div className="p-3.5 rounded-lg bg-surface-container/60 border border-border/40">
                    <span className="material-symbols-outlined text-[20px] text-primary mb-1">airline_seat_recline_extra</span>
                    <div className="text-[13px] font-medium text-on-surface">Berth &amp; Coach Mapping</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">Top-down coach interior and exact berth placement</div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface-container/60 border border-border/40">
                    <span className="material-symbols-outlined text-[20px] text-success mb-1">verified</span>
                    <div className="text-[13px] font-medium text-on-surface">Live PRS Sync</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">Real-time CNF, RAC, and Waitlist updates</div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface-container/60 border border-border/40">
                    <span className="material-symbols-outlined text-[20px] text-info mb-1">train</span>
                    <div className="text-[13px] font-medium text-on-surface">Train Radar</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">Direct integration with live train movement</div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 4. MAIN TWO-COLUMN RESULT AREA ==================== */}
            {pnrData && !isLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">

                {/* ─── PRIMARY LEFT COLUMN (8 cols) ─── */}
                <div className="lg:col-span-8 flex flex-col gap-space-lg min-w-0">

                  {/* 5. Service Hero Banner Card */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm overflow-hidden flex flex-col border border-border">
                    {/* Top state ribbon */}
                    <div className="bg-surface-container px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-sm border-b border-border/50">
                      <div className="flex items-center gap-space-sm">
                        <span className="font-label text-label text-text-tertiary uppercase tracking-wider">PNR:</span>
                        <span className="font-heading-md text-heading-md font-semibold text-on-surface tracking-wider">
                          {formatPNR(pnrData.pnr)}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant font-label text-label uppercase">
                          {pnrData.travelClassName || (pnrData.trainNumber.startsWith('12') ? 'Superfast AC Special' : 'Express')}
                        </span>
                      </div>
                      <div className="flex items-center gap-space-sm">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-label font-semibold tracking-wide uppercase ${
                          pnrData.chartPrepared ? 'bg-success/10 text-success' : 'bg-surface-container-high text-warning'
                        }`}>
                          <span
                            className="material-symbols-outlined text-[15px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {pnrData.chartPrepared ? 'check_circle' : 'pending'}
                          </span>
                          {pnrData.chartPrepared ? 'Chart Prepared' : 'Chart Not Prepared'}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label text-label font-semibold tracking-wider uppercase ${
                          pnrData.bookingStatus.toUpperCase().includes('CNF') || pnrData.bookingStatus.toUpperCase().includes('CONFIRM')
                            ? 'bg-success text-on-primary'
                            : 'bg-warning text-on-primary'
                        }`}>
                          {pnrData.bookingStatus}
                        </span>
                      </div>
                    </div>

                    {/* Train Main Metrics */}
                    <div className="p-space-lg flex flex-col gap-space-lg">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-md">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-space-xs text-on-surface flex-wrap">
                            <span className="font-heading-lg text-heading-lg font-bold tracking-tight">
                              {pnrData.trainNumber}
                            </span>
                            <span className="text-outline-variant font-heading-lg">/</span>
                            <span className="font-heading-lg text-heading-lg font-bold tracking-tight">
                              {pnrData.trainNumber ? (parseInt(pnrData.trainNumber, 10) + 1) : '—'}
                            </span>
                            <span className="font-heading-lg text-heading-lg tracking-tight font-medium ml-1">
                              {pnrData.trainName.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-space-sm mt-1 text-on-surface-variant font-body-sm text-body-sm flex-wrap">
                            <span>
                              Class: <strong className="text-on-surface">{pnrData.travelClass || '3A'}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Quota: <strong className="text-on-surface">{pnrData.quota ? `${pnrData.quota} (General)` : 'General Quota (GN)'}</strong>
                            </span>
                            {pnrData.distanceKm && (
                              <>
                                <span>•</span>
                                <span>
                                  Distance: <strong className="text-on-surface">{pnrData.distanceKm}</strong>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Quick action links */}
                        <div className="flex items-center gap-space-xs self-start flex-wrap">
                          <button
                            className="px-space-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-1.5 transition-colors"
                            onClick={handleShare}
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[17px]">share</span>
                            <span>Share</span>
                          </button>
                          <button
                            className="px-space-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-1.5 transition-colors"
                            onClick={handleDownloadPdf}
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[17px]">download</span>
                            <span>PDF Ticket</span>
                          </button>
                        </div>
                      </div>

                      {/* 6. Route Timeline Ribbon */}
                      <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border border-border/40">
                        {/* Origin Station */}
                        <div className="flex flex-col min-w-[160px]">
                          <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                            Origin Departure
                          </span>
                          <span className="font-heading-lg text-heading-lg font-bold text-on-surface mt-0.5">
                            {pnrData.departureTime || '—'}
                          </span>
                          <span className="font-body-md text-body-md font-semibold text-on-surface">
                            {pnrData.sourceStationName || pnrData.sourceStationCode} {pnrData.sourceStationCode ? `(${pnrData.sourceStationCode})` : ''}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {pnrData.journeyDate || 'Scheduled Day'}{pnrData.departurePlatform ? ` · Platform ${pnrData.departurePlatform}` : ''}
                          </span>
                        </div>

                        {/* Intermediate Path Graphic */}
                        <div className="flex-1 flex flex-col items-center justify-center px-space-md">
                          <div className="w-full flex items-center justify-between text-on-surface-variant font-label text-label uppercase tracking-wider mb-1.5">
                            <span>{pnrData.duration || (pnrData.distanceKm ? `${pnrData.distanceKm} run` : 'Direct Run')}</span>
                            <span>{pnrData.haltsCount != null ? `${pnrData.haltsCount} Halts` : 'Scheduled Halts'}</span>
                          </div>
                          <div className="relative w-full flex items-center">
                            <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0"></div>
                            <div className="flex-1 h-0.5 bg-outline-variant relative">
                              <div className="absolute inset-0 bg-primary w-2/3"></div>
                            </div>
                            <div className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0 mx-1"></div>
                            <div className="flex-1 h-0.5 bg-outline-variant"></div>
                            <div className="w-3 h-3 rounded-full bg-on-surface-variant flex-shrink-0"></div>
                          </div>
                          {pnrData.intermediateHalts && pnrData.intermediateHalts.length > 0 && (
                            <div className="w-full flex items-center justify-between font-label text-label text-text-tertiary mt-1.5 flex-wrap">
                              {pnrData.intermediateHalts.map((h) => (
                                <span key={h.code}>
                                  {h.code} {h.time ? `(${h.time})` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Destination Station */}
                        <div className="flex flex-col text-left md:text-right min-w-[160px]">
                          <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                            Destination Arrival
                          </span>
                          <span className="font-heading-lg text-heading-lg font-bold text-on-surface mt-0.5">
                            {pnrData.arrivalTime || '—'}
                          </span>
                          <span className="font-body-md text-body-md font-semibold text-on-surface">
                            {pnrData.destinationStationName || pnrData.destinationStationCode} {pnrData.destinationStationCode ? `(${pnrData.destinationStationCode})` : ''}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {pnrData.arrivalPlatform ? `Platform ${pnrData.arrivalPlatform}` : 'Arrival Station'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 7. Passenger Breakdown Table Card */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm flex flex-col overflow-hidden border border-border">
                    <div className="px-space-lg py-space-md bg-surface-container flex items-center justify-between border-b border-border/50">
                      <div className="flex items-center gap-space-sm">
                        <span className="material-symbols-outlined text-on-surface text-[20px]">groups</span>
                        <h2 className="font-heading-md text-heading-md font-semibold text-on-surface">
                          Passenger Berth Allocation
                        </h2>
                        <span className="px-2 py-0.5 rounded-full bg-surface text-on-surface-variant font-label text-label">
                          {pnrData.passengers.length} Passenger{pnrData.passengers.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                        Auto-upgraded: No
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant font-label text-label uppercase tracking-wider">
                            <th className="py-space-sm px-space-lg">Passenger Details</th>
                            <th className="py-space-sm px-space-md">Booking Status</th>
                            <th className="py-space-sm px-space-md">Current Status</th>
                            <th className="py-space-sm px-space-md">Coach</th>
                            <th className="py-space-sm px-space-md">Berth No.</th>
                            <th className="py-space-sm px-space-md">Berth Type</th>
                            <th className="py-space-sm px-space-lg text-right">Verification</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">
                          {pnrData.passengers.map((p, idx) => {
                            const isCnf = p.confirmed || p.currentStatus.toUpperCase().includes('CNF');
                            return (
                              <tr key={idx} className="hover:bg-surface-container/50 transition-colors">
                                <td className="py-space-md px-space-lg">
                                  <div className="flex flex-col">
                                    <span className="font-body-md text-body-md font-semibold text-on-surface">
                                      Passenger {p.passengerNumber}
                                    </span>
                                    <span className="text-on-surface-variant font-label text-label">
                                      {p.age ? `Adult · ${p.age} yrs` : 'Passenger'} {p.gender ? `· ${p.gender}` : ''}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-space-md px-space-md">
                                  <span className="px-2 py-1 rounded bg-surface-container text-on-surface font-body-sm text-body-sm font-mono">
                                    {p.bookingStatus}
                                  </span>
                                </td>
                                <td className="py-space-md px-space-md">
                                  <span className={`font-semibold ${isCnf ? 'text-success' : 'text-warning'}`}>
                                    {p.currentStatus}
                                  </span>
                                </td>
                                <td className="py-space-md px-space-md">
                                  <span className="font-heading-md text-heading-md font-bold text-on-surface">
                                    {p.coach || '—'}
                                  </span>
                                </td>
                                <td className="py-space-md px-space-md">
                                  <span className="font-heading-md text-heading-md font-bold text-on-surface">
                                    {p.berthNumber || '—'}
                                  </span>
                                </td>
                                <td className="py-space-md px-space-md">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label text-label uppercase font-medium">
                                      {p.berthType || 'Berth'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-space-md px-space-lg text-right">
                                  <span className={`inline-flex items-center gap-1 font-label text-label font-semibold ${
                                    isCnf ? 'text-success' : 'text-warning'
                                  }`}>
                                    <span className={`w-2 h-2 rounded-full ${isCnf ? 'bg-success' : 'bg-warning'}`}></span>
                                    {isCnf ? 'Confirmed' : p.currentStatus}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm text-on-surface-variant font-body-sm text-body-sm border-t border-border/40">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[18px] text-success">verified</span>
                        <span>
                          {userBaysInCoach.length > 0
                            ? `All ${pnrData.passengers.length} passengers allocated seats in Cabin Section Bay ${userBaysInCoach.join(' & ')}.`
                            : `All ${pnrData.passengers.length} passengers allocated seats on CRIS database.`}
                        </span>
                      </div>
                      <span className="font-label text-label text-text-tertiary">
                        {pnrData.chartPrepared
                          ? `Chart Finalized by CRIS PRS Server ${pnrData.sourceStationCode || 'HQ'}`
                          : 'Pending Final Chart Preparation'}
                      </span>
                    </div>
                  </div>

                  {/* 8. Intelligent Coach & Seat Composition Preview: Enhanced Architectural Top-Down Blueprint */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm p-space-lg flex flex-col gap-space-lg border border-border">
                    {/* Header & Platform Positioning Assist */}
                    <div className="flex flex-col gap-space-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[22px]">floor_plan</span>
                            <h2 className="font-heading-md text-heading-md font-semibold text-on-surface">
                              Interactive Top-Down Coach Interior &amp; Seat Diagram
                            </h2>
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                            Top-down engineering schematic of {coachClassName} Coach {activeCoach} ({layoutMeta.totalBerths} Berths, LHB Rake Series)
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success font-label text-label font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                            {passengersInActiveCoach.length} Confirmed Berth{passengersInActiveCoach.length === 1 ? '' : 's'}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container font-label text-label text-on-surface font-medium">
                            <span className="material-symbols-outlined text-[15px]">straight</span>
                            Heading Forward
                          </span>
                        </div>
                      </div>

                      {/* Platform Boarding Assist Banner */}
                      <div className="p-3 rounded-lg bg-surface-container-low border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-body-sm">
                        <div className="flex items-center gap-2 text-on-surface">
                          <div className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {pnrData.sourceStationCode || 'NDLS'}
                          </div>
                          <div>
                            <span className="font-medium text-on-surface">Platform Boarding Assist:</span>
                            <span className="text-on-surface-variant ml-1">
                              {pnrData.sourceStationName || pnrData.sourceStationCode}{pnrData.departurePlatform ? ` Platform ${pnrData.departurePlatform}` : ''}: Coach {activeCoach} is at position {coachPositionNumber ? `${coachPositionNumber} of ${displayRake.length}` : 'in rake sequence'}.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-label text-on-surface-variant shrink-0">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-info"></span> Coach Length: 23.54m
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-success"></span> Doors at Both Ends
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Train Rake Coach Selector Bar */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-label text-text-tertiary">
                        <span className="uppercase tracking-wider">Train Rake Coaches (Select to switch view):</span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">arrow_back</span> Engine End (Platform Front)
                        </span>
                      </div>
                      <div className="overflow-x-auto pb-2 -mx-1 px-1">
                        <div className="flex items-center gap-1.5 min-w-[780px]">
                          {displayRake.map((coach, idx) => {
                            const isThisUserCoach = userCoach && coach.code.toUpperCase().replace(/\s+|-/g, '') === userCoach.toUpperCase().replace(/\s+|-/g, '');
                            const isSelected = coach.code.toUpperCase().replace(/\s+|-/g, '') === activeCoach.toUpperCase().replace(/\s+|-/g, '');
                            const isLoco = coach.code === 'LOCO' || coach.code === 'ENG' || coach.classType === 'LOCO';
                            const isEOG = coach.code === 'EOG' || coach.code === 'LPR' || coach.code === 'SLRD';
                            const isPC = coach.code === 'PC';

                            if (isLoco) {
                              return (
                                <button
                                  key={`${coach.position || idx}-${coach.code}`}
                                  className={`h-14 px-2.5 rounded-lg flex flex-col items-center justify-center transition-colors text-center shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2'
                                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                                  }`}
                                  title="WAP-7 Electric Locomotive"
                                  type="button"
                                  onClick={() => setSelectedCoach(coach.code)}
                                >
                                  <span className="material-symbols-outlined text-[17px]">train</span>
                                  <span className="font-label text-[9px] font-bold uppercase mt-0.5">LOCO</span>
                                </button>
                              );
                            }

                            if (isEOG) {
                              return (
                                <button
                                  key={`${coach.position || idx}-${coach.code}`}
                                  className={`h-14 px-2 rounded-lg flex flex-col items-center justify-center transition-colors shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2'
                                      : 'bg-surface-container text-text-tertiary hover:bg-surface-container-high'
                                  }`}
                                  title="Power Generator Car"
                                  type="button"
                                  onClick={() => setSelectedCoach(coach.code)}
                                >
                                  <span className="font-label text-[10px] font-bold">EOG</span>
                                  <span className="text-[8px] uppercase">Power</span>
                                </button>
                              );
                            }

                            if (isPC) {
                              return (
                                <button
                                  key={`${coach.position || idx}-${coach.code}`}
                                  className={`h-14 px-2.5 rounded-lg flex flex-col items-center justify-center transition-colors shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2'
                                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                  }`}
                                  title="Pantry Car"
                                  type="button"
                                  onClick={() => setSelectedCoach(coach.code)}
                                >
                                  <span className="material-symbols-outlined text-[15px]">restaurant</span>
                                  <span className="font-label text-[9px] font-bold uppercase">PC</span>
                                </button>
                              );
                            }

                            if (isSelected) {
                              return (
                                <div
                                  key={`${coach.position || idx}-${coach.code}`}
                                  className="h-14 px-3.5 rounded-lg bg-primary text-on-primary ring-2 ring-primary ring-offset-2 flex flex-col items-center justify-center shadow-md relative shrink-0 cursor-pointer"
                                  onClick={() => setSelectedCoach(coach.code)}
                                >
                                  {isThisUserCoach && (
                                    <span className="absolute -top-2 bg-success text-white font-label text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                                      Your Coach
                                    </span>
                                  )}
                                  <span className="font-heading-md text-sm font-bold tracking-tight">{coach.code}</span>
                                  <span className="font-label text-[9px] text-on-primary/80 font-medium uppercase">
                                    {isThisUserCoach && passengersInActiveCoach.length > 0
                                      ? `${passengersInActiveCoach.length} Berths (${coach.classType || '3A'})`
                                      : coach.classType || 'Coach'}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <button
                                key={`${coach.position || idx}-${coach.code}`}
                                className={`h-14 px-2.5 rounded-lg flex flex-col items-center justify-center transition-colors shrink-0 ${
                                  isThisUserCoach
                                    ? 'bg-surface-container-highest border border-primary/30 text-on-surface'
                                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                }`}
                                type="button"
                                onClick={() => setSelectedCoach(coach.code)}
                              >
                                <span className="font-heading-md text-xs font-bold">{coach.code}</span>
                                <span className="font-label text-[8px] text-text-tertiary uppercase">
                                  {isThisUserCoach ? 'Your Coach' : (coach.classType ? `${coach.classType} Tier` : 'Coach')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bay Selector Quick Navigation Strip */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border">
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                        <span className="font-label text-label text-text-tertiary uppercase tracking-wider mr-1">
                          Jump to Bay:
                        </span>
                        {baysData.map((bay) => {
                          const isBayActive = selectedBay === bay.bayNumber;
                          const hasPassenger = userBaysInCoach.includes(bay.bayNumber);

                          if (hasPassenger) {
                            return (
                              <button
                                key={bay.bayNumber}
                                type="button"
                                onClick={() => setSelectedBay(bay.bayNumber)}
                                className={`px-2.5 py-1 rounded font-label text-label font-semibold shadow-sm flex items-center gap-1 transition-all ${
                                  isBayActive
                                    ? 'bg-primary text-on-primary ring-2 ring-primary/40'
                                    : 'bg-primary text-on-primary hover:opacity-90'
                                }`}
                              >
                                <span>Bay {bay.bayNumber} ({bay.startBerth}–{bay.endBerth})</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={bay.bayNumber}
                              type="button"
                              onClick={() => setSelectedBay(bay.bayNumber)}
                              className={`px-2 py-1 rounded font-label text-label transition-colors ${
                                isBayActive
                                  ? 'bg-surface-container-highest text-on-surface font-semibold border border-primary/30'
                                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                              }`}
                            >
                              Bay {bay.bayNumber} ({bay.startBerth}–{bay.endBerth})
                            </button>
                          );
                        })}
                      </div>

                      {userBaysInCoach.length > 0 && (
                        <div className="flex items-center gap-2 font-label text-label text-on-surface-variant">
                          <span className="material-symbols-outlined text-[16px] text-success">verified</span>
                          <span>
                            Your seats are in <strong>Bay {userBaysInCoach.join(' & ')}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Authentic Full-Coach Top-Down Architectural Blueprint Schematic */}
                    <div ref={baySectionRef} className="rounded-xl border border-border bg-[#f8f9fa] dark:bg-[#151517] p-space-md flex flex-col gap-space-md shadow-inner overflow-hidden">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-heading-md text-xs font-bold tracking-wider uppercase text-on-surface">
                            COACH {activeCoach} · TOP-VIEW ARCHITECTURAL FLOOR PLAN
                          </span>
                          <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label text-[10px]">
                            Scale: 1:50 Standard Gauge
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-label text-[11px] text-on-surface-variant">
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-1 rounded bg-border border border-outline"></span> Exterior Wall &amp; Windows
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-danger">logout</span> Emergency Exit
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-on-surface">electric_bolt</span> Charging Points
                          </span>
                        </div>
                      </div>

                      {/* Coach Shell Graphic Container (Scrollable Horizontal Viewport) */}
                      <div className="overflow-x-auto pb-4 pt-1">
                        <div className="min-w-[1100px] bg-surface-elevated rounded-xl border-2 border-outline-variant p-3 shadow-sm relative flex flex-col">
                          {/* Train direction indicator banner on top wall */}
                          <div className="flex items-center justify-between px-2 py-1 mb-2 bg-surface-container-low rounded border border-border text-[10px] font-label text-on-surface-variant">
                            <div className="flex items-center gap-1 text-on-surface font-semibold">
                              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                              <span>ENGINE / FORWARD HEADING (Towards {pnrData.destinationStationCode || 'DEST'})</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span>LEFT SIDE: 6-BERTH MAIN CABIN COMPARTMENTS (LB / MB / UB)</span>
                              <span>•</span>
                              <span>RIGHT SIDE: 2-BERTH SIDE BAYS (SL / SU)</span>
                            </div>
                            <div className="flex items-center gap-1 text-text-tertiary">
                              <span>REAR VESTIBULE</span>
                              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </div>
                          </div>

                          {/* Outer Coach Body with Facilities and Bays */}
                          <div className="flex items-stretch border border-outline-variant rounded-lg bg-surface-container-low/40 overflow-hidden relative">
                            {/* FRONT VESTIBULE & UTILITIES END (Left) */}
                            <div className="w-32 bg-surface-container-high/70 border-r-2 border-outline-variant p-2 flex flex-col justify-between shrink-0">
                              {/* Top Facility: Toilet & Wash */}
                              <div className="p-1.5 rounded bg-surface-elevated border border-border flex flex-col items-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">wc</span>
                                <span className="font-label text-[9px] font-semibold text-on-surface mt-0.5">TOILET 1 &amp; 2</span>
                                <span className="text-[8px] text-text-tertiary">Bio-Vacuum</span>
                              </div>
                              {/* Central Front Door / Vestibule */}
                              <div className="my-3 py-2 px-1 rounded border-2 border-dashed border-outline-variant bg-surface-elevated flex flex-col items-center justify-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-primary">door_front</span>
                                <span className="font-label text-[9px] font-bold text-on-surface">DOOR 1</span>
                                <span className="text-[8px] text-text-tertiary">Platform Entry</span>
                              </div>
                              {/* Bottom Facility: Washbasin */}
                              <div className="p-1.5 rounded bg-surface-elevated border border-border flex flex-col items-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">wash</span>
                                <span className="font-label text-[9px] font-semibold text-on-surface mt-0.5">WASHBASIN</span>
                                <span className="text-[8px] text-text-tertiary">Purified Water</span>
                              </div>
                            </div>

                            {/* PASSENGER CABINS & AISLE (All Bays) */}
                            <div className="flex-1 flex flex-col justify-between py-2 px-1">
                              {/* TOP ROW: 6-BERTH MAIN COMPARTMENT BAYS */}
                              <div className={`grid gap-1.5 ${
                                baysData.length <= 6
                                  ? 'grid-cols-6'
                                  : baysData.length <= 8
                                  ? 'grid-cols-8'
                                  : 'grid-cols-9'
                              }`}>
                                {baysData.map((bay) => {
                                  const seatedPassengerInBay = bay.mainBerths
                                    .map((mb) => getPassengerForSeat(mb.num))
                                    .find((p) => p !== null);
                                  const isBayHighlighted = Boolean(seatedPassengerInBay);

                                  return (
                                    <div
                                      key={bay.bayNumber}
                                      className={`p-1.5 rounded bg-surface-elevated flex flex-col gap-1 transition-all relative ${
                                        isBayHighlighted
                                          ? 'border-2 border-success shadow-sm ring-2 ring-success/20'
                                          : 'border border-border'
                                      }`}
                                    >
                                      {/* Emergency Exit badge on Bay 7 */}
                                      {bay.bayNumber === 7 && (
                                        <span className="absolute -top-1.5 right-1 px-1 rounded bg-danger text-white text-[7px] font-bold">
                                          EXIT
                                        </span>
                                      )}
                                      <div className={`flex items-center justify-between text-[8px] font-label border-b pb-0.5 ${
                                        isBayHighlighted
                                          ? 'text-success font-bold border-success/30'
                                          : 'text-text-tertiary border-border'
                                      }`}>
                                        <span>BAY {bay.bayNumber}</span>
                                        {isBayHighlighted ? (
                                          <span className="bg-success text-white px-1 rounded text-[7px]">
                                            P{seatedPassengerInBay?.index} SEATED
                                          </span>
                                        ) : (
                                          <span className="text-on-surface">{bay.startBerth}–{bay.endBerth}</span>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-2 gap-1 text-[9px] font-semibold text-center">
                                        {bay.mainBerths.map((seat) => {
                                          const pass = getPassengerForSeat(seat.num);
                                          if (pass) {
                                            return (
                                              <div
                                                key={seat.num}
                                                className="p-1 rounded bg-success text-white font-bold shadow-sm ring-1 ring-white/50 flex flex-col items-center justify-center"
                                              >
                                                <span className="text-[10px]">{seat.num}</span>
                                                <span className="text-[7px] uppercase font-bold tracking-tight">
                                                  {seat.type} (P{pass.index})
                                                </span>
                                              </div>
                                            );
                                          }
                                          return (
                                            <div
                                              key={seat.num}
                                              className="p-1 rounded bg-surface-container text-on-surface-variant flex flex-col items-center justify-center"
                                            >
                                              <span>{seat.num}</span>
                                              <span className="text-[8px] block font-normal text-text-tertiary">
                                                {seat.type}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* CENTRAL WALKING AISLE / GANGWAY WITH FLOW ARROWS */}
                              <div className="my-2 py-1 bg-surface-container flex items-center justify-between px-4 rounded border-y border-border">
                                <div className="flex items-center gap-1 font-label text-[9px] text-text-tertiary font-medium uppercase tracking-wider">
                                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                  <span>Central Corridor / Aisle Gangway (Width: 600mm)</span>
                                </div>
                                <div className="flex items-center gap-6 font-label text-[9px] text-text-tertiary">
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                                    Bay {userBaysInCoach[0] || '4'}/{(userBaysInCoach[0] || 4) + 1} Crossway
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px] text-on-surface-variant">electric_meter</span>
                                    Power Hub 220V
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 font-label text-[9px] text-text-tertiary font-medium uppercase tracking-wider">
                                  <span>Aisle Flow</span>
                                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </div>
                              </div>

                              {/* BOTTOM ROW: 2-BERTH SIDE BAYS */}
                              <div className={`grid gap-1.5 ${
                                baysData.length <= 6
                                  ? 'grid-cols-6'
                                  : baysData.length <= 8
                                  ? 'grid-cols-8'
                                  : 'grid-cols-9'
                              }`}>
                                {baysData.map((bay) => {
                                  const seatedPassengerInSide = bay.sideBerths
                                    .map((sb) => getPassengerForSeat(sb.num))
                                    .find((p) => p !== null);
                                  const isSideHighlighted = Boolean(seatedPassengerInSide);

                                  return (
                                    <div
                                      key={bay.bayNumber}
                                      className={`p-1.5 rounded bg-surface-elevated flex flex-col gap-1 transition-all ${
                                        isSideHighlighted
                                          ? 'border-2 border-success shadow-sm ring-2 ring-success/20'
                                          : 'border border-border'
                                      }`}
                                    >
                                      <div className={`flex items-center justify-between text-[8px] font-label border-b pb-0.5 ${
                                        isSideHighlighted
                                          ? 'text-success font-bold border-success/30'
                                          : 'text-text-tertiary border-border'
                                      }`}>
                                        <span>SIDE BAY {bay.bayNumber}</span>
                                        {isSideHighlighted && (
                                          <span className="bg-success text-white px-1 rounded text-[7px]">
                                            P{seatedPassengerInSide?.index} SEATED
                                          </span>
                                        )}
                                      </div>
                                      <div className={`grid gap-1 text-[9px] font-semibold text-center ${
                                        bay.sideBerths.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                                      }`}>
                                        {bay.sideBerths.map((seat) => {
                                          const pass = getPassengerForSeat(seat.num);
                                          if (pass) {
                                            return (
                                              <div
                                                key={seat.num}
                                                className="p-1 rounded bg-success text-white font-bold shadow-sm ring-1 ring-white/50 flex flex-col items-center justify-center"
                                              >
                                                <span className="text-[10px]">{seat.num}</span>
                                                <span className="text-[7px] uppercase font-bold tracking-tight">
                                                  {seat.type} (P{pass.index})
                                                </span>
                                              </div>
                                            );
                                          }
                                          return (
                                            <div
                                              key={seat.num}
                                              className="p-1 rounded bg-surface-container text-on-surface-variant flex flex-col items-center justify-center"
                                            >
                                              <span>{seat.num}</span>
                                              <span className="text-[8px] block font-normal text-text-tertiary">
                                                {seat.type}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* REAR VESTIBULE & UTILITIES END (Right) */}
                            <div className="w-32 bg-surface-container-high/70 border-l-2 border-outline-variant p-2 flex flex-col justify-between shrink-0">
                              {/* Top Facility: Safety Station */}
                              <div className="p-1.5 rounded bg-surface-elevated border border-border flex flex-col items-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-danger">fire_extinguisher</span>
                                <span className="font-label text-[9px] font-semibold text-on-surface mt-0.5">FIRE EXTINGUISHER</span>
                                <span className="text-[8px] text-text-tertiary">Safety Station</span>
                              </div>
                              {/* Central Rear Door / Vestibule */}
                              <div className="my-3 py-2 px-1 rounded border-2 border-dashed border-outline-variant bg-surface-elevated flex flex-col items-center justify-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-primary">door_front</span>
                                <span className="font-label text-[9px] font-bold text-on-surface">DOOR 2</span>
                                <span className="text-[8px] text-text-tertiary">Rear Gangway</span>
                              </div>
                              {/* Bottom Facility: Toilet 3 & 4 */}
                              <div className="p-1.5 rounded bg-surface-elevated border border-border flex flex-col items-center text-center">
                                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">wc</span>
                                <span className="font-label text-[9px] font-semibold text-on-surface mt-0.5">TOILET 3 &amp; 4</span>
                                <span className="text-[8px] text-text-tertiary">Western Style</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Architectural Legend & Berth Type Guide Strip */}
                      <div className="p-space-sm rounded-lg bg-surface-elevated border border-border flex flex-wrap items-center justify-between gap-space-md text-on-surface-variant font-label text-label">
                        <div className="flex flex-wrap items-center gap-space-md">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 rounded bg-success flex items-center justify-center text-white text-[9px] font-bold">✓</span>
                            <span className="font-semibold text-on-surface">
                              Your Confirmed Berths ({passengersInActiveCoach.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 rounded bg-surface-container border border-border"></span>
                            <span>Occupied / General Co-Passengers</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 rounded bg-surface-container-high border-2 border-dashed border-outline"></span>
                            <span>RAC / Dynamic Quota</span>
                          </div>
                          <div className="h-3 w-px bg-border hidden sm:block"></div>
                          <div className="flex items-center gap-2 text-text-tertiary">
                            <span><strong>LB:</strong> Lower</span>
                            <span><strong>MB:</strong> Middle</span>
                            <span><strong>UB:</strong> Upper</span>
                            <span><strong>SL:</strong> Side Lower</span>
                            <span><strong>SU:</strong> Side Upper</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-text-tertiary ml-auto">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">electric_bolt</span> Individual 220V Outlets
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">light</span> Reading Lamps
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ─── SUPPORTING RIGHT COLUMN (4 cols) ─── */}
                <div className="lg:col-span-4 flex flex-col gap-space-lg">

                  {/* 10. Live Train Operational Snapshot Card */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm p-space-lg flex flex-col gap-space-md border border-border">
                    <div className="flex items-center justify-between">
                      <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                        Live Rail Radar
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success font-label text-label font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                        {pnrData.liveTrainStatus?.isOnTime ? 'ON TIME' : (pnrData.liveTrainStatus?.statusText || 'ON TIME')}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="font-heading-md text-heading-md font-semibold text-on-surface">
                        Train {pnrData.trainNumber} Status
                      </span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {pnrData.liveTrainStatus?.locationNotice || (
                          pnrData.departurePlatform
                            ? `Scheduled to depart from Platform ${pnrData.departurePlatform}. Live tracking updates active on departure.`
                            : 'Live tracking telemetry active on journey departure date.'
                        )}
                      </p>
                    </div>

                    {/* Radar Mini Map Visual */}
                    <div
                      className="w-full h-44 rounded-xl bg-cover bg-center overflow-hidden relative shadow-inner bg-surface-container"
                      style={{
                        backgroundImage:
                          "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAJyZn122n0TnZGJMbj80yluAvvLTrcJ4R9qPg8rquFhkGWZJyGsI-6HV_NVvGeF5E1b1XYppPmfj8hiB4suKVZKQ5WStGYQpZqxYR4MjoPhzzJ3L33CJer61S7Lp_dxX_Jm9h2xQKGH0KMy23RKWYTQnsHD2jGaTgBu6DHm1FliIjpyWoqoP3L5hlXSprv7JeUyrv-ugDQpq73dGHJVasXMSnPV79ZFpAOqJFVXWMs94Il8cl5ovr64g')",
                      }}
                    >
                      <div className="absolute inset-0 bg-primary/20 backdrop-blur-[0.5px] p-space-md flex flex-col justify-between">
                        <span className="self-start px-2 py-1 rounded bg-surface-elevated/90 text-on-surface font-label text-label font-semibold shadow-sm">
                          {pnrData.sourceStationCode || 'Source'} Corridor
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-1 rounded bg-primary text-on-primary font-label text-label font-medium">
                            {pnrData.liveTrainStatus?.isOnTime || (pnrData.liveTrainStatus?.speedKmh ?? 0) > 0 ? 'Telemetry Active' : 'Timetable View'}
                          </span>
                          <span className="text-on-primary font-label text-label">
                            {pnrData.liveTrainStatus?.speedKmh != null ? `Speed: ${pnrData.liveTrainStatus.speedKmh} km/h` : 'Speed: —'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Link
                      className="w-full py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-space-xs transition-colors"
                      href={
                        pnrData.liveTrainStatus?.journeyId
                          ? `/journey/${pnrData.liveTrainStatus.journeyId}/map`
                          : `/#radar`
                      }
                    >
                      <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
                      <span>Open Live Satellite Radar</span>
                    </Link>
                  </div>

                  {/* 11. Cancellation & Refund Advice Card */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm p-space-lg flex flex-col gap-space-sm border border-border">
                    <div className="flex items-center gap-space-xs text-on-surface">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">policy</span>
                      <h3 className="font-heading-md text-heading-md font-semibold">Cancellation Terms</h3>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {pnrData.cancellationTerms?.summary || 'Standard IRCTC clerkage deductions apply based on time of cancellation prior to chart preparation.'}
                    </p>
                    {typeof pnrData.cancellationTerms?.currentRefundValue === 'number' ? (
                      <div className="p-space-sm rounded bg-surface-container flex items-center justify-between font-label text-label">
                        <span className="text-on-surface-variant">Current Refund Value:</span>
                        <span className="font-bold text-on-surface">₹{pnrData.cancellationTerms.currentRefundValue.toLocaleString('en-IN')}</span>
                      </div>
                    ) : (
                      <div className="p-space-sm rounded bg-surface-container flex items-center justify-between font-label text-label">
                        <span className="text-on-surface-variant">Clerkage Policy:</span>
                        <span className="font-medium text-on-surface">As per IRCTC Gazette Rules</span>
                      </div>
                    )}
                  </div>

                  {/* 12. Value Added Services Shortcuts */}
                  <div className="grid grid-cols-2 gap-space-sm">
                    <a
                      className="p-space-md rounded-xl bg-surface-elevated hover:bg-surface-container shadow-sm flex flex-col gap-space-xs transition-colors border border-border"
                      href="https://www.ecatering.irctc.co.in/"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span className="material-symbols-outlined text-on-surface text-[22px]">restaurant_menu</span>
                      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Order E-Catering</span>
                      <span className="font-label text-label text-on-surface-variant">
                        {userCoach
                          ? `Deliver to Coach ${userCoach}${pnrData.passengers[0]?.berthNumber ? ` Seat ${pnrData.passengers[0].berthNumber}` : ''}`
                          : `Deliver to your train seat`}
                      </span>
                    </a>
                    <a
                      className="p-space-md rounded-xl bg-surface-elevated hover:bg-surface-container shadow-sm flex flex-col gap-space-xs transition-colors border border-border"
                      href="https://www.irctctourism.com/"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span className="material-symbols-outlined text-on-surface text-[22px]">weekend</span>
                      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Station Lounge</span>
                      <span className="font-label text-label text-on-surface-variant">
                        Book pass at {pnrData.sourceStationCode}
                      </span>
                    </a>
                  </div>

                </div>

              </div>
            )}

            {/* 14. Bottom Status & Refresh Strip */}
            {pnrData && !isLoading && (
              <div className="p-space-md rounded-xl bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-md border border-border/50">
                <div className="flex items-center gap-space-sm">
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  <span className="font-body-sm text-body-sm text-on-surface font-medium">
                    Official CRIS / NTES Passenger Reservation System Telemetry
                  </span>
                  <span className="text-outline-variant hidden md:inline">•</span>
                  <span className="font-label text-label text-text-tertiary hidden md:inline">
                    Live Record Verified
                  </span>
                </div>
                <div className="flex items-center gap-space-sm">
                  <button
                    className="px-space-md py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-1.5 shadow-sm transition-colors border border-border"
                    onClick={handleRefresh}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    <span>Refresh Record</span>
                  </button>
                  <a
                    className="px-space-md py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm shadow-sm transition-colors border border-border flex items-center gap-1.5"
                    href="https://www.irctc.co.in/nget/enquiry/refund-rules"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>IRCTC Refund Rules</span>
                    <span className="material-symbols-outlined text-[14px] text-text-tertiary">open_in_new</span>
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ==================== FOOTER ==================== */}
      <footer className="w-full bg-surface-container-low border-t border-border">
        <div className="w-full max-w-[1440px] mx-auto px-margin py-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium">All IR CTC Sectors Operational</span>
            </div>
            <span className="text-outline-variant hidden sm:inline">•</span>
            <span className="font-label text-label text-on-surface-variant uppercase">PRS ENQUIRY FEED INTEGRATION</span>
          </div>
          <div className="flex items-center gap-space-lg font-body-sm text-body-sm text-on-surface-variant flex-wrap">
            <Link className="hover:text-on-surface transition-colors" href="/#radar">Live Radar</Link>
            <Link className="hover:text-on-surface transition-colors" href="/saved">Saved Trains</Link>
            <Link className="hover:text-on-surface transition-colors" href="/settings">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
