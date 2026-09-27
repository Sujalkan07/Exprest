import React from 'react';
import { JourneyStatus } from '@exprest/types';
import { clsx } from 'clsx';

interface StatusPillProps {
  status: JourneyStatus;
  delayMinutes?: number | null;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, delayMinutes, className }) => {
  let label = 'UNKNOWN';
  let bgClass = 'bg-gray-100 text-gray-700';
  let dotClass = 'bg-gray-500';

  switch (status) {
    case 'ON_TIME':
      label = '● ON TIME';
      bgClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      dotClass = 'bg-emerald-600';
      break;
    case 'DELAYED':
      const delayText = delayMinutes ? `${delayMinutes} MIN LATE` : 'DELAYED';
      label = `● ${delayText}`;
      bgClass = 'bg-amber-50 text-amber-800 border border-amber-200';
      dotClass = 'bg-amber-600';
      break;
    case 'NO_LIVE_DATA':
      label = '● NO LIVE DATA';
      bgClass = 'bg-slate-100 text-slate-700 border border-slate-200';
      dotClass = 'bg-slate-400';
      break;
    case 'COMPLETED':
      label = '● ARRIVED / COMPLETED';
      bgClass = 'bg-blue-50 text-blue-800 border border-blue-200';
      dotClass = 'bg-blue-600';
      break;
    case 'NOT_STARTED':
      label = '● SCHEDULED';
      bgClass = 'bg-gray-100 text-gray-700 border border-gray-200';
      dotClass = 'bg-gray-400';
      break;
  }

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold tracking-wide', bgClass, className)}>
      {label}
    </span>
  );
};
