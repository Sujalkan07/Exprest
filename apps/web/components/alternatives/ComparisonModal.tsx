'use client';

import React, { useEffect } from 'react';
import { ComparisonItem } from './types';
import { formatCurrency } from './dateUtils';

interface ComparisonModalProps {
  isOpen: boolean;
  items: ComparisonItem[];
  onClose: () => void;
  onClearAll: () => void;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  isOpen,
  items,
  onClose,
  onClearAll,
}) => {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const metrics: { key: keyof ComparisonItem | 'route' | 'timings'; label: string }[] = [
    { key: 'category', label: 'Pathway Type' },
    { key: 'fare', label: 'Ticket Fare' },
    { key: 'duration', label: 'Travel Duration' },
    { key: 'transfers', label: 'Interchanges' },
    { key: 'route', label: 'Route & Stations' },
    { key: 'timings', label: 'Timings (IST)' },
    { key: 'status', label: 'Availability / Quota' },
    { key: 'actionNote', label: 'Booking Action' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparisonModalTitle"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-3xl w-full max-w-4xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-text text-xl">
              compare_arrows
            </span>
            <div>
              <h3 id="comparisonModalTitle" className="text-base font-bold text-text">
                Pathway Comparison Matrix
              </h3>
              <p className="text-xs text-text-secondary">
                Compare fare, duration, transfers, and booking rules side-by-side
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison modal"
            className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-12 text-center text-text-secondary">
              No pathways selected. Check &quot;+ Compare&quot; on any alternative card to begin.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="border-b border-border text-text-secondary uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4 font-bold bg-surface-container-low w-36">
                      Metric
                    </th>
                    {items.map((item) => (
                      <th
                        key={`header-${item.id}`}
                        className="py-3 px-4 font-bold text-text border-l border-border min-w-[200px]"
                      >
                        {item.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.map((m) => (
                    <tr key={`row-${m.key}`}>
                      <td className="py-2.5 px-4 font-semibold text-text-secondary bg-surface-container-low align-top">
                        {m.label}
                      </td>
                      {items.map((item) => {
                        let content: React.ReactNode = null;
                        if (m.key === 'fare') {
                          content = (
                            <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(item.fare)}
                            </span>
                          );
                        } else if (m.key === 'route') {
                          content = (
                            <span className="font-mono text-[11px] text-text">
                              {item.routeSummary}
                            </span>
                          );
                        } else if (m.key === 'timings') {
                          content = (
                            <span>
                              Dep: {item.departureTime || '—'} · Arr: {item.arrivalTime || '—'}
                            </span>
                          );
                        } else if (m.key === 'transfers') {
                          content = (
                            <span>
                              {item.transfers === 0
                                ? '0 (Same Coach throughout)'
                                : `${item.transfers} interchange`}
                            </span>
                          );
                        } else if (m.key === 'actionNote') {
                          content = (
                            <span className="text-[11px] text-text-secondary">
                              {item.actionNote || 'Standard IRCTC reservation'}
                            </span>
                          );
                        } else {
                          content = String(item[m.key as keyof ComparisonItem] || '—');
                        }

                        return (
                          <td
                            key={`cell-${item.id}-${m.key}`}
                            className="py-2.5 px-4 text-text border-l border-border font-medium align-top"
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rule 142 Warning Reminder in Modal */}
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-text flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-base shrink-0 mt-0.5">
              help
            </span>
            <p className="leading-relaxed">
              <strong>Reminder:</strong> For same-train alternatives booked from earlier stations, always select your actual intended boarding point on IRCTC to retain validity under Rule 142.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-container-low flex justify-between items-center">
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline"
          >
            Clear All Selected
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-text text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
