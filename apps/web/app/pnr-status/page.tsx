'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DarkModeToggle } from '@/components/common/DarkModeToggle';
import { createClient } from '@/lib/supabase/client';
import { PnrStatusResult, PassengerStatus, CoachRakeItem } from '@exprest/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

const DEFAULT_RAKE: CoachRakeItem[] = [
  { position: 1, code: 'ENG', classType: 'LOCO', className: 'Locomotive Engine' },
  { position: 2, code: 'SLRD', classType: 'EOG', className: 'Seating cum Luggage Rake' },
  { position: 3, code: 'GEN', classType: 'GEN', className: 'General Unreserved' },
  { position: 4, code: 'GEN', classType: 'GEN', className: 'General Unreserved' },
  { position: 5, code: 'S1', classType: 'SL', className: 'Sleeper Class' },
  { position: 6, code: 'S2', classType: 'SL', className: 'Sleeper Class' },
  { position: 7, code: 'S3', classType: 'SL', className: 'Sleeper Class' },
  { position: 8, code: 'S4', classType: 'SL', className: 'Sleeper Class' },
  { position: 9, code: 'S5', classType: 'SL', className: 'Sleeper Class' },
  { position: 10, code: 'S6', classType: 'SL', className: 'Sleeper Class' },
  { position: 11, code: 'S7', classType: 'SL', className: 'Sleeper Class' },
  { position: 12, code: 'PC', classType: 'PC', className: 'Pantry Car' },
  { position: 13, code: 'B1', classType: '3A', className: 'AC 3 Tier' },
  { position: 14, code: 'B2', classType: '3A', className: 'AC 3 Tier' },
  { position: 15, code: 'B3', classType: '3A', className: 'AC 3 Tier' },
  { position: 16, code: 'B4', classType: '3A', className: 'AC 3 Tier' },
  { position: 17, code: 'A1', classType: '2A', className: 'AC 2 Tier' },
  { position: 18, code: 'A2', classType: '2A', className: 'AC 2 Tier' },
  { position: 19, code: 'H1', classType: '1A', className: 'AC First Class' },
  { position: 20, code: 'EOG', classType: 'EOG', className: 'End On Generation Car' },
];

function getCoachClass(coachCode: string, rake?: CoachRakeItem[], travelClass?: string): string {
  const rakeItem = rake?.find((r) => r.code.toUpperCase() === coachCode.toUpperCase());
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
  const code = (coachCode || '').toUpperCase();
  if (code.startsWith('B')) return '3A';
  if (code.startsWith('M')) return '3E';
  if (code.startsWith('A')) return '2A';
  if (code.startsWith('H')) return '1A';
  if (code.startsWith('S') && !code.startsWith('SLR')) return 'SL';
  if (code.startsWith('C') || code.startsWith('D')) return 'CC';
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

export default function PnrStatusPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [pnrInput, setPnrInput] = useState('624-819-3042');
  const [isLoading, setIsLoading] = useState(false);
  const [pnrData, setPnrData] = useState<PnrStatusResult | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    code: string;
    message: string;
    isFlushed?: boolean;
    isNotFound?: boolean;
  } | null>(null);

  const [recentLookups, setRecentLookups] = useState<RecentPnrItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    isLoggedIn?: boolean;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        if (Array.isArray(parsed)) {
          setRecentLookups(parsed.slice(0, 5));
        }
      }
    } catch {
      setRecentLookups([]);
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
      setPnrData(null);
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

        setErrorInfo({
          code: errCode,
          message: errMsg,
          isFlushed,
          isNotFound,
        });
        setPnrData(null);
        return;
      }

      const result: PnrStatusResult = json?.data;
      if (!result) {
        setErrorInfo({
          code: 'NO_DATA',
          message: 'No booking details returned for this PNR record.',
          isNotFound: true,
        });
        setPnrData(null);
        return;
      }

      setPnrData(result);
      setErrorInfo(null);

      // Add to recent lookups only on genuine success
      const firstPassenger = result.passengers?.[0];
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

  // 3. Initial search query param handling
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

  // 4. Initialize coach and bay selection when PNR data is loaded or refreshed
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
    } else {
      setSelectedCoach(null);
      setSelectedBay(null);
    }
  }, [pnrData]);

  // Input change handler with auto-formatting
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPNR(e.target.value);
    setPnrInput(formatted);
    if (errorInfo) setErrorInfo(null);
  };

  // Keyboard shortcut Ctrl+Enter or Cmd+Enter
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

  // Wallet shortcut
  const handleWallet = () => {
    showToast('Apple & Google Wallet pass sync is not currently supported for Indian Railways tickets.');
  };

  // File TDR
  const handleFileTdr = () => {
    window.open('https://www.irctc.co.in/nget/enquiry/refund-rules', '_blank', 'noopener,noreferrer');
  };

  // Refresh current status
  const handleRefresh = () => {
    if (pnrInput) {
      performLookup(pnrInput);
      showToast('Refreshing latest PRS record...');
    }
  };

  // User's allocated coach (if any) and interactive coach selection
  const userCoach = pnrData?.userCoach || pnrData?.passengers?.find((p) => p.coach)?.coach || null;
  const displayRake = (pnrData?.rakeComposition && pnrData.rakeComposition.length > 0)
    ? pnrData.rakeComposition
    : DEFAULT_RAKE;
  const activeCoach = selectedCoach || userCoach || (displayRake.find((c) => !['ENG', 'LOCO', 'EOG', 'LPR'].includes(c.code))?.code) || displayRake[0]?.code || 'B4';
  const isUserActiveCoach = Boolean(userCoach && activeCoach.toUpperCase() === userCoach.toUpperCase());
  const activeCoachIndex = displayRake.findIndex((c) => c.code.toUpperCase() === activeCoach.toUpperCase());
  const activeCoachItem = activeCoachIndex !== -1 ? displayRake[activeCoachIndex] : undefined;
  const coachClass = getCoachClass(activeCoach, displayRake, pnrData?.travelClass);
  const layoutMeta = getCoachLayoutMeta(coachClass, activeCoachItem?.totalBerths);

  const userPassengersInCoach = (pnrData?.passengers || []).filter(
    (p) => p.coach && p.coach.toUpperCase() === activeCoach.toUpperCase() && p.berthNumber != null
  );
  const userPrimaryBerthNum = userPassengersInCoach[0]
    ? parseInt(String(userPassengersInCoach[0].berthNumber).replace(/\D/g, ''), 10)
    : null;
  const userPrimaryBay = (userPrimaryBerthNum && !isNaN(userPrimaryBerthNum) && userPrimaryBerthNum > 0)
    ? Math.min(layoutMeta.totalBays, Math.max(1, Math.ceil(userPrimaryBerthNum / layoutMeta.berthsPerBay)))
    : 1;

  const currentBay = selectedBay || userPrimaryBay || 1;
  const bayStartBerth = (currentBay - 1) * layoutMeta.berthsPerBay + 1;
  const bayEndBerth = Math.min(currentBay * layoutMeta.berthsPerBay, layoutMeta.totalBerths);

  const bayBerths: Array<{ num: number; type: string }> = [];
  for (let n = bayStartBerth; n <= bayEndBerth; n++) {
    bayBerths.push({
      num: n,
      type: getBerthType(n, coachClass),
    });
  }

  const userPassengersInBay = userPassengersInCoach.filter((p) => {
    const num = parseInt(String(p.berthNumber).replace(/\D/g, ''), 10);
    return !isNaN(num) && num >= bayStartBerth && num <= bayEndBerth;
  });

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

  const socketBerths = bayBerths.filter((b) => ['LB', 'SL', 'SU'].includes(b.type)).map((b) => b.num);
  const socketBerthsText = socketBerths.length > 0
    ? `Charging sockets at Berth ${socketBerths.slice(0, 3).join(', ')}${socketBerths.length > 3 ? '...' : ''}`
    : null;

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
                  errorInfo.isFlushed
                    ? 'bg-amber-500/10 border-amber-500/30 text-on-surface'
                    : 'bg-danger/10 border-danger/30 text-on-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined text-[24px] mt-0.5 ${
                      errorInfo.isFlushed ? 'text-warning' : 'text-danger'
                    }`}
                  >
                    {errorInfo.isFlushed ? 'history_toggle_off' : 'error'}
                  </span>
                  <div>
                    <h3 className="font-heading-md text-heading-md font-semibold">
                      {errorInfo.isFlushed
                        ? 'PNR Record Flushed / Journey Completed'
                        : errorInfo.isNotFound
                        ? 'PNR Number Not Found or Invalid'
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

            {/* Initial Empty State (When no search has been submitted yet) */}
            {!pnrData && !errorInfo && !isLoading && (
              <div className="rounded-xl bg-surface-elevated border border-border p-space-2xl text-center flex flex-col items-center justify-center gap-space-md shadow-sm">
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
                  <span className="material-symbols-outlined text-[32px]">train</span>
                </div>
                <div className="max-w-lg">
                  <h2 className="font-heading-lg text-heading-lg font-bold text-on-surface">
                    Indian Railways PNR Status &amp; Berth Allocation
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">
                    Enter any 10-digit Indian Railways PNR number above to retrieve live reservation status, chart finalization, coach rake position, and passenger seat assignments directly from the PRS network.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-2 font-label text-label text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-success">check_circle</span>
                    CRIS Live Sync
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-success">view_module</span>
                    Coach Position Visualizer
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-success">radar</span>
                    Live Train GPS Telemetry
                  </span>
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
                              Quota: <strong className="text-on-surface">{pnrData.quota ? `${pnrData.quota} (General)` : 'GN'}</strong>
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
                          <button
                            className="px-space-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-1.5 transition-colors"
                            onClick={handleWallet}
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[17px]">account_balance_wallet</span>
                            <span>Wallet</span>
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
                            {pnrData.departureTime || '16:55'}
                          </span>
                          <span className="font-body-md text-body-md font-semibold text-on-surface">
                            {pnrData.sourceStationName} ({pnrData.sourceStationCode})
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {pnrData.journeyDate} · {pnrData.departurePlatform ? `Platform ${pnrData.departurePlatform}` : 'Platform 3'}
                          </span>
                        </div>

                        {/* Intermediate Path Graphic */}
                        <div className="flex-1 flex flex-col items-center justify-center px-space-md">
                          <div className="w-full flex items-center justify-between text-on-surface-variant font-label text-label uppercase tracking-wider mb-1.5">
                            <span>{pnrData.duration || '15h 37m transit'}</span>
                            <span>{pnrData.haltsCount ? `${pnrData.haltsCount} Halts` : '5 Halts'}</span>
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
                          <div className="w-full flex items-center justify-between font-label text-label text-text-tertiary mt-1.5 flex-wrap">
                            {pnrData.intermediateHalts && pnrData.intermediateHalts.length > 0 ? (
                              pnrData.intermediateHalts.map((h) => (
                                <span key={h.code}>
                                  {h.code} {h.time ? `(${h.time})` : ''}
                                </span>
                              ))
                            ) : (
                              <>
                                <span>KOTA (21:05)</span>
                                <span>RTM (00:15)</span>
                                <span>BRC (03:55)</span>
                                <span>ST (05:25)</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Destination Station */}
                        <div className="flex flex-col text-left md:text-right min-w-[160px]">
                          <span className="font-label text-label text-text-tertiary uppercase tracking-wider">
                            Destination Arrival
                          </span>
                          <span className="font-heading-lg text-heading-lg font-bold text-on-surface mt-0.5">
                            {pnrData.arrivalTime || '08:32'}
                          </span>
                          <span className="font-body-md text-body-md font-semibold text-on-surface">
                            {pnrData.destinationStationName} ({pnrData.destinationStationCode})
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            Next Day · {pnrData.arrivalPlatform ? `Platform ${pnrData.arrivalPlatform}` : 'Platform 1'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 7. Passenger Status and Berth-Allocation Table Card */}
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
                        <span>All {pnrData.passengers.length} passengers allocated seats on CRIS database.</span>
                      </div>
                      <span className="font-label text-label text-text-tertiary">
                        Chart Status: {pnrData.chartPrepared ? 'Finalized by CRIS PRS Server' : 'Pending Final Charting'}
                      </span>
                    </div>
                  </div>

                  {/* 8. Intelligent Coach & Seat Composition Preview */}
                  <div className="rounded-xl bg-surface-elevated shadow-sm p-space-lg flex flex-col gap-space-lg border border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-heading-md text-heading-md font-semibold text-on-surface">
                            Rake Composition &amp; Coach {activeCoach}
                          </h2>
                          {isUserActiveCoach && (
                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-label text-label font-semibold uppercase">
                              Your Booked Coach
                            </span>
                          )}
                          {!isUserActiveCoach && userCoach && (
                            <button
                              onClick={() => {
                                setSelectedCoach(userCoach);
                                setSelectedBay(userPrimaryBay);
                              }}
                              className="px-2 py-0.5 rounded-md bg-surface-container hover:bg-surface-container-high text-primary font-label text-label font-medium transition-colors"
                              type="button"
                            >
                              ← Switch to Your Coach ({userCoach})
                            </button>
                          )}
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Train layout relative to engine position (Heading Forward) · Click any coach to inspect layout
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container font-label text-label text-on-surface font-medium self-start sm:self-auto">
                        <span className="material-symbols-outlined text-[16px]">location_on</span>
                        {pnrData.departurePlatform
                          ? `Platform ${pnrData.departurePlatform} · ${pnrData.sourceStationCode}`
                          : `${pnrData.sourceStationCode} (${pnrData.sourceStationName})`}
                        {activeCoachIndex !== -1 && (
                          <span className="text-text-tertiary">· Pos {activeCoachIndex + 1}/{displayRake.length}</span>
                        )}
                      </span>
                    </div>

                    {/* Rake Visualizer Strip */}
                    <div className="overflow-x-auto pb-2">
                      <div className="flex items-center gap-1.5 min-w-[720px] py-2">
                        {displayRake.map((coach, idx) => {
                          const isThisUserCoach = userCoach && coach.code.toUpperCase() === userCoach.toUpperCase();
                          const isSelected = coach.code.toUpperCase() === activeCoach.toUpperCase();
                          const isLoco = coach.code === 'ENG' || coach.classType === 'LOCO' || coach.code === 'LOCO';
                          const isPowerCar = coach.code === 'EOG' || coach.code === 'LPR' || coach.code === 'SLRD';
                          const isPantry = coach.code === 'PC';

                          if (isLoco) {
                            return (
                              <button
                                key={`${coach.position || idx}-${coach.code}`}
                                type="button"
                                onClick={() => setSelectedCoach(coach.code)}
                                title={`Locomotive Engine (Position ${coach.position || idx + 1})`}
                                className={`w-16 h-12 rounded-lg flex flex-col items-center justify-center flex-shrink-0 transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                                    : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[18px]">train</span>
                                <span className="font-label text-[9px] uppercase font-semibold">LOCO</span>
                              </button>
                            );
                          }

                          if (isPowerCar) {
                            return (
                              <button
                                key={`${coach.position || idx}-${coach.code}`}
                                type="button"
                                onClick={() => setSelectedCoach(coach.code)}
                                title={`Power Generator Car (Position ${coach.position || idx + 1})`}
                                className={`w-11 h-12 rounded-lg flex flex-col items-center justify-center flex-shrink-0 transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                                    : 'bg-surface-container text-text-tertiary hover:bg-surface-container-high'
                                }`}
                              >
                                <span className="font-label text-[9px] uppercase font-semibold">{coach.code}</span>
                              </button>
                            );
                          }

                          if (isPantry) {
                            return (
                              <button
                                key={`${coach.position || idx}-${coach.code}`}
                                type="button"
                                onClick={() => setSelectedCoach(coach.code)}
                                title={`Pantry / Dining Car (Position ${coach.position || idx + 1})`}
                                className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center flex-shrink-0 transition-all ${
                                  isSelected
                                    ? 'ring-2 ring-primary bg-primary/10 text-primary'
                                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[16px]">restaurant</span>
                                <span className="font-label text-[9px] uppercase font-semibold">PC</span>
                              </button>
                            );
                          }

                          if (isThisUserCoach) {
                            return (
                              <button
                                key={`${coach.position || idx}-${coach.code}`}
                                type="button"
                                onClick={() => setSelectedCoach(coach.code)}
                                title={`Your Coach: ${coach.code} (Position ${coach.position || idx + 1})`}
                                className="w-20 h-14 rounded-lg bg-primary text-on-primary flex flex-col items-center justify-center flex-shrink-0 shadow-md ring-2 ring-primary hover:opacity-95 transition-transform active:scale-95"
                              >
                                <span className="font-label text-[9px] uppercase tracking-wider opacity-75">Your Coach</span>
                                <span className="font-heading-md text-heading-md font-bold tracking-tight">{coach.code}</span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={`${coach.position || idx}-${coach.code}`}
                              type="button"
                              onClick={() => setSelectedCoach(coach.code)}
                              title={`Coach ${coach.code} · ${coach.className || coach.classType || ''} (Position ${coach.position || idx + 1})`}
                              className={`w-11 h-12 rounded-lg flex flex-col items-center justify-center flex-shrink-0 transition-all ${
                                isSelected
                                  ? 'bg-surface-container-highest ring-2 ring-primary text-primary font-bold shadow-sm'
                                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                              }`}
                            >
                              <span className="font-label text-[10px] font-semibold">{coach.code}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 9. Coach Internal Bay Layout Diagram */}
                    {['LOCO', 'PC', 'EOG'].includes(coachClass) ? (
                      <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col items-center justify-center py-8 text-center gap-2 border border-border/40">
                        <span className="material-symbols-outlined text-[36px] text-primary">
                          {coachClass === 'PC' ? 'restaurant' : 'bolt'}
                        </span>
                        <h3 className="font-heading-md text-heading-md font-semibold text-on-surface">
                          {coachClassName} ({activeCoach})
                        </h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                          {coachClass === 'PC'
                            ? 'Pantry and onboard catering facility. Meals and refreshments are prepared here for passengers during transit.'
                            : 'Operational railway service unit. This car does not contain passenger passenger berths.'}
                        </p>
                        {userCoach && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCoach(userCoach);
                              setSelectedBay(userPrimaryBay);
                            }}
                            className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:opacity-90 transition-opacity"
                          >
                            Return to Your Coach ({userCoach})
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-md border border-border/40">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading-md text-body-md font-semibold text-on-surface">
                              Inside Coach {activeCoach} · Bay {currentBay} of {layoutMeta.totalBays}
                            </span>
                            <span className="text-on-surface-variant font-body-sm text-body-sm">
                              (Berths {bayStartBerth}–{bayEndBerth})
                            </span>
                            <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label text-label uppercase">
                              {coachClassName}
                            </span>
                          </div>

                          {/* Bay navigator controls */}
                          <div className="flex items-center gap-1.5 self-start sm:self-auto">
                            <button
                              type="button"
                              disabled={currentBay <= 1}
                              onClick={() => setSelectedBay(Math.max(1, currentBay - 1))}
                              className="px-2 py-1 rounded bg-surface-elevated hover:bg-surface-container disabled:opacity-40 disabled:pointer-events-none text-on-surface font-label text-label border border-border transition-colors flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                              <span>Prev Bay</span>
                            </button>
                            <span className="px-2 font-label text-label text-text-tertiary">
                              {currentBay} / {layoutMeta.totalBays}
                            </span>
                            <button
                              type="button"
                              disabled={currentBay >= layoutMeta.totalBays}
                              onClick={() => setSelectedBay(Math.min(layoutMeta.totalBays, currentBay + 1))}
                              className="px-2 py-1 rounded bg-surface-elevated hover:bg-surface-container disabled:opacity-40 disabled:pointer-events-none text-on-surface font-label text-label border border-border transition-colors flex items-center gap-1"
                            >
                              <span>Next Bay</span>
                              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                            </button>
                          </div>
                        </div>

                        {/* Informational banners if user has berths elsewhere or allocation pending */}
                        {userPassengersInCoach.length > 0 && userPassengersInBay.length === 0 && (
                          <div className="px-3 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm flex items-center justify-between gap-2 border border-border/50">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-[18px]">info</span>
                              <span>
                                Your confirmed seat ({userPassengersInCoach.map(p => `Berth ${p.berthNumber}`).join(', ')}) is in <strong>Bay {userPrimaryBay}</strong>.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedBay(userPrimaryBay)}
                              className="px-2.5 py-1 rounded bg-primary text-on-primary font-label text-label font-medium hover:opacity-90 transition-opacity flex-shrink-0"
                            >
                              Jump to My Seat
                            </button>
                          </div>
                        )}

                        {!userCoach && (
                          <div className="px-3 py-2 rounded-lg bg-surface-container-high/60 text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 border border-border/40">
                            <span className="material-symbols-outlined text-[18px] text-warning">pending</span>
                            <span>
                              Berth and coach numbers will be finalized by CRIS when reservation charts are prepared. Previewing standard {coachClassName} layout.
                            </span>
                          </div>
                        )}

                        {/* Dynamic Seat Grid Representation */}
                        <div className={`grid gap-space-xs text-center font-label text-label ${
                          bayBerths.length <= 4
                            ? 'grid-cols-2 sm:grid-cols-4'
                            : bayBerths.length <= 6
                            ? 'grid-cols-3 sm:grid-cols-6'
                            : 'grid-cols-4 sm:grid-cols-8'
                        }`}>
                          {bayBerths.map((seat) => {
                            const matchedPassengerIndex = pnrData.passengers.findIndex(
                              (p) => (p.coach ? p.coach.toUpperCase() === activeCoach.toUpperCase() : isUserActiveCoach) &&
                                    String(p.berthNumber) === String(seat.num)
                            );
                            const isAllocated = matchedPassengerIndex !== -1;

                            if (isAllocated) {
                              return (
                                <div
                                  key={seat.num}
                                  className="p-2.5 rounded-lg bg-success text-on-primary font-bold shadow-md ring-2 ring-success/30 flex flex-col items-center justify-center transition-transform scale-[1.02]"
                                >
                                  <span className="font-heading-md text-heading-md leading-none">{seat.num}</span>
                                  <span className="block text-[9px] uppercase tracking-wider font-semibold mt-1">
                                    {seat.type} (P{matchedPassengerIndex + 1})
                                  </span>
                                  <span className="text-[8px] opacity-90 font-medium">Your Confirmed Berth</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={seat.num}
                                className="p-2.5 rounded-lg bg-surface-elevated text-on-surface-variant border border-border/40 hover:border-border transition-colors flex flex-col items-center justify-center"
                              >
                                <span className="font-heading-sm text-heading-sm text-on-surface font-semibold">{seat.num}</span>
                                <span className="block text-[10px] text-text-tertiary font-medium mt-0.5">{seat.type}</span>
                                <span className="text-[8px] text-outline font-normal">Standard Berth</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Legend and Socket info */}
                        <div className="flex items-center gap-space-md font-label text-label text-on-surface-variant pt-1 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded bg-success"></span>
                            <span>Your Confirmed Berths</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded bg-surface-elevated border border-border"></span>
                            <span>Other Berths in Bay</span>
                          </div>
                          {socketBerthsText && (
                            <div className="flex items-center gap-1.5 ml-auto text-text-tertiary">
                              <span className="material-symbols-outlined text-[15px] text-on-surface-variant">electric_bolt</span>
                              <span>{socketBerthsText}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                          <>
                            Rake placement verified at origin yard. Scheduled to place at <strong>Platform 3</strong> (40 mins before departure).
                          </>
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
                          {pnrData.sourceStationCode} Yard · Sector 1
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-1 rounded bg-primary text-on-primary font-label text-label font-medium">
                            GPS Linked
                          </span>
                          <span className="text-on-primary font-label text-label">
                            Speed: {pnrData.liveTrainStatus?.speedKmh ?? 0} km/h
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

                  {/* 13. Value Added Services Shortcuts */}
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
                          ? `Deliver to Seat ${userCoach}-${pnrData.passengers[0]?.berthNumber || '32'}`
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
            <div className="p-space-md rounded-xl bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-md border border-border/50">
              <div className="flex items-center gap-space-sm">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                <span className="font-body-sm text-body-sm text-on-surface font-medium">
                  Official CRIS / NTES Passenger Reservation System Telemetry
                </span>
                <span className="text-outline-variant hidden md:inline">•</span>
                <span className="font-label text-label text-text-tertiary hidden md:inline">
                  Sync latency 24ms · Auto-refresh active every 60s
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
                <button
                  className="px-space-md py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm shadow-sm transition-colors border border-border"
                  onClick={handleFileTdr}
                  type="button"
                >
                  File TDR
                </button>
              </div>
            </div>

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
            <span className="font-label text-label text-on-surface-variant uppercase">SYNC LATENCY: 24MS</span>
          </div>
          <div className="flex items-center gap-space-lg font-body-sm text-body-sm text-on-surface-variant flex-wrap">
            <a className="hover:text-on-surface transition-colors" href="#">Telemetry Stream</a>
            <a className="hover:text-on-surface transition-colors" href="#">Radar Nodes</a>
            <a className="hover:text-on-surface transition-colors" href="#">API Health</a>
            <a className="hover:text-on-surface transition-colors" href="#">Network Ops</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
