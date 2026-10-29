'use client';

import React, { useEffect } from 'react';

interface CoachSpecsModalProps {
  isOpen: boolean;
  trainNumber: string;
  trainName: string;
  onClose: () => void;
}

export const CoachSpecsModal: React.FC<CoachSpecsModalProps> = ({
  isOpen,
  trainNumber,
  trainName,
  onClose,
}) => {
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

  // Determine nominal rake characteristics based on train prefix or number
  const isRajdhani = trainName.toLowerCase().includes('rajdhani') || trainName.toLowerCase().includes('shatabdi');
  const rakeType = isRajdhani ? 'Modern LHB Rake (German Technology)' : 'Standard LHB Express Rake';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coachSpecsModalTitle"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-3xl w-full max-w-lg shadow-2xl border border-border overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-text text-xl">
              airline_seat_recline_extra
            </span>
            <div>
              <h3 id="coachSpecsModalTitle" className="text-base font-bold text-text">
                Coach Composition & Specifications
              </h3>
              <p className="text-xs text-text-secondary">
                {trainNumber} {trainName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-surface-container-low border border-border">
              <span className="text-[10px] uppercase font-semibold text-text-secondary">
                Rake Technology
              </span>
              <div className="text-xs font-bold text-text mt-0.5">{rakeType}</div>
            </div>
            <div className="p-3 rounded-xl bg-surface-container-low border border-border">
              <span className="text-[10px] uppercase font-semibold text-text-secondary">
                Coach Rake Verification
              </span>
              <div className="text-xs font-bold text-text mt-0.5">Finalized at Chart Prep (~4h prior)</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-text">Configured Classes:</span>
            <div className="flex flex-wrap gap-1.5">
              {['1A (AC First)', '2A (AC 2 Tier)', '3A (AC 3 Tier)', '3E (AC 3 Economy)', 'SL (Sleeper)', 'GS (General)'].map(
                (cls) => (
                  <span
                    key={cls}
                    className="px-2.5 py-1 rounded-lg bg-surface-container text-text font-medium text-[11px]"
                  >
                    {cls}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Transparent Live Data Notice */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-text flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg shrink-0 mt-0.5">
              info
            </span>
            <div className="flex flex-col gap-1 leading-relaxed">
              <span className="font-bold text-[11px]">
                Truthful Telemetry Notice:
              </span>
              <p className="text-[11px] text-text-secondary">
                Exact physical coach sequencing (e.g. Loco → EOG → S1-S6 → B1-B6 → A1-A2 → H1) and platform spot indications are finalized by Indian Railways upon chart preparation (~4 hours prior to originating station departure). Please consult station coach guidance display indicators at the platform.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-container-low flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-text text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
