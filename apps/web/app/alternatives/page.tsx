import React, { Suspense } from 'react';
import { AlternativesClient } from './AlternativesClient';
import { SkeletonLoader } from '@/components/alternatives/EmptyAndLoadingStates';

export const metadata = {
  title: 'Smart Alternative Journey Finder — Exprest',
  description:
    'Find alternative routes, prior station segments, and timed connecting trains when direct railway berths are exhausted or waitlisted.',
};

export default function AlternativesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg p-8 flex flex-col gap-6">
          <div className="h-12 w-full bg-surface-container rounded-2xl animate-pulse" />
          <div className="h-40 w-full bg-surface-container rounded-2xl animate-pulse" />
          <SkeletonLoader />
        </div>
      }
    >
      <AlternativesClient />
    </Suspense>
  );
}
