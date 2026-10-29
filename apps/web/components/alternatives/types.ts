import {
  StationInfo,
  SameTrainAlternative,
  DirectTrainAlternative,
  ConnectingAlternative,
  AlternativeJourneysResult,
  FareType,
  AvailabilityCategory,
} from '@exprest/types';

export type {
  StationInfo,
  SameTrainAlternative,
  DirectTrainAlternative,
  ConnectingAlternative,
  AlternativeJourneysResult,
  FareType,
  AvailabilityCategory,
};

export type SortCriteria = 'best' | 'cheapest' | 'fastest' | 'earliest' | 'transfers';

export interface FilterOptions {
  includeEarlierStop: boolean;
  maxLayoverMinutes: number;
  maxDurationMinutes: number;
  maxFare: number;
  directOnly: boolean;
  availableOnly: boolean;
  sameStationOnly: boolean;
}

export interface ComparisonItem {
  id: string;
  name: string;
  category: string;
  fare: number | string;
  duration: string;
  durationMinutes: number;
  transfers: number | string;
  status: string;
  routeSummary: string;
  departureTime?: string;
  arrivalTime?: string;
  actionNote?: string;
}

export interface CoachSpecsInfo {
  trainNumber: string;
  trainName: string;
  rakeType: string;
  classes: string[];
  totalCoaches?: number;
  layoutDescription: string;
}
