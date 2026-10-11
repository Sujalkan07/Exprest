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

  const normalized = (status || '').toUpperCase().trim();

  switch (normalized) {
    case 'RUNNING':
      if (delayMinutes && delayMinutes > 0) {
        label = `● RUNNING (+${delayMinutes}m)`;
        bgClass = 'bg-amber-50 text-amber-800 border border-amber-200';
      } else {
        label = '● RUNNING';
        bgClass = 'bg-teal-50 text-teal-800 border border-teal-200';
      }
      break;
    case 'ON_TIME':
      label = '● ON TIME';
      bgClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      break;
    case 'DELAYED':
      const delayText = delayMinutes ? `${delayMinutes} MIN LATE` : 'DELAYED';
      label = `● ${delayText}`;
      bgClass = 'bg-amber-50 text-amber-800 border border-amber-200';
      break;
    case 'NO_LIVE_DATA':
      label = '● NO LIVE DATA';
      bgClass = 'bg-slate-100 text-slate-700 border border-slate-200';
      break;
    case 'COMPLETED':
      label = '● ARRIVED / COMPLETED';
      bgClass = 'bg-blue-50 text-blue-800 border border-blue-200';
      break;
    case 'NOT_STARTED':
      label = '● SCHEDULED';
      bgClass = 'bg-gray-100 text-gray-700 border border-gray-200';
      break;
    case 'CANCELLED':
      label = '● CANCELLED';
      bgClass = 'bg-red-50 text-red-800 border border-red-200';
      break;
    default:
      label = `● ${normalized || 'UNKNOWN'}`;
      bgClass = 'bg-gray-100 text-gray-700 border border-gray-200';
      break;
  }

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold tracking-wide', bgClass, className)}>
      {label}
    </span>
  );
};
