// Exprest Domain Models & API Contracts (PRD Section 8 & 15)

export type JourneyStatus =
  | 'ON_TIME'
  | 'DELAYED'
  | 'NO_LIVE_DATA'
  | 'COMPLETED'
  | 'NOT_STARTED'
  | 'RUNNING'
  | 'CANCELLED';

export type PoiCategory =
  | 'RIVERS_LAKES'
  | 'MOUNTAINS_GHATS'
  | 'BRIDGES_TUNNELS'
  | 'MONUMENTS'
  | 'CITIES_DISTRICTS';

export interface Train {
  id: string;
  number: string;
  name: string;
  originStationId: string;
  destinationStationId: string;
  originStationName?: string;
  destinationStationName?: string;
  type?: string;
  sourceProvider: string;
  providerTrainId: string;
  routeVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Station {
  id: string;
  code: string | null;
  name: string;
  latitude: number;
  longitude: number;
  city: string | null;
  district: string | null;
  state: string | null;
  timezone: string;
}

export interface TrainStop {
  stationId: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  sequence: number;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
  delayMinutes: number | null;
  distanceKm?: number;
  platform?: string | null;
  status?: string;
}

export interface JourneyRun {
  id: string;
  trainId: string;
  serviceDate: string;
  startDate?: string;
  originStationId: string;
  destinationStationId: string;
  status: JourneyStatus;
  startedAt: string | null;
  completedAt: string | null;
  observedAt: string | null;
  delayMinutes?: number;
}

export interface LivePosition {
  latitude: number;
  longitude: number;
  heading: number | null;
  speedKph: number | null;
  currentStationId: string | null;
  currentStationName?: string | null;
  nextStationId: string | null;
  nextStationName?: string | null;
  delayMinutes?: number;
  status?: string;
  startDate?: string;
  observedAt: string | null;
}

export interface JourneyProgress {
  totalDistanceKm: number | null;
  coveredDistanceKm: number | null;
  remainingDistanceKm: number | null;
  percent: number | null;
  completedStations: number;
  totalStations: number;
}

export interface WeatherObservation {
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  rainProbabilityPct: number | null;
  observedAt: string;
}

export interface ElevationPoint {
  distanceKm: number;
  latitude: number;
  longitude: number;
  elevationM: number;
}

export interface NearbyPoi {
  id: string;
  category: PoiCategory;
  name: string;
  latitude: number;
  longitude: number;
  distanceFromRouteM: number;
  source: string;
  tags: Record<string, string | number | boolean | null>;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteTrain {
  userId: string;
  trainId: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface RecentSearch {
  id: string;
  userId: string | null;
  trainId: string;
  searchedAt: string;
}

export interface SharedJourney {
  id: string;
  tokenHash: string;
  journeyId: string;
  createdByUserId: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

// Standard API Response Envelopes (PRD Section 7.1)
export interface ApiMeta {
  requestId: string;
  generatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export type ErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_JOURNEY_ID'
  | 'TRAIN_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'LIVE_NOT_FOUND'
  | 'LIVE_DATA_STALE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'ROUTE_UNAVAILABLE'
  | 'WEATHER_UNAVAILABLE'
  | 'TOPOGRAPHY_UNAVAILABLE'
  | 'POI_UNAVAILABLE'
  | 'SHARE_CREATE_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_PNR'
  | 'PNR_NOT_FOUND'
  | 'PNR_FLUSHED'
  | 'PNR_UNAVAILABLE';

export interface PassengerStatus {
  passengerNumber: number;
  bookingStatus: string;
  bookingCoach?: string | null;
  bookingBerth?: string | number | null;
  currentStatus: string;
  coach: string | null;
  berthNumber: string | number | null;
  berthType: string | null;
  confirmed: boolean;
  age?: number | null;
  gender?: string | null;
}

export interface CoachRakeItem {
  position: number;
  code: string;
  classType: string;
  className?: string;
  category?: string;
  totalBerths?: number;
  hasSeats?: boolean;
}

export interface PnrFareDetails {
  baseFare?: number | string | null;
  surcharges?: number | string | null;
  convenienceFee?: number | string | null;
  cateringCharges?: number | string | null;
  totalAmountPaid?: number | string | null;
  transactionId?: string | null;
  paymentMethod?: string | null;
  perPassengerFare?: number | string | null;
  breakdownSource?: string | null;
}

export interface PnrLiveTrainStatus {
  trainNumber: string;
  statusText: string;
  isOnTime: boolean;
  delayMinutes: number;
  speedKmh?: number | null;
  platform?: string | null;
  locationNotice?: string | null;
  journeyId?: string | null;
}

export interface PnrStatusResult {
  pnr: string;
  trainNumber: string;
  trainName: string;
  journeyDate: string;
  sourceStationCode: string;
  sourceStationName: string;
  destinationStationCode: string;
  destinationStationName: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
  departurePlatform?: string | null;
  arrivalPlatform?: string | null;
  duration?: string | null;
  haltsCount?: number | null;
  intermediateHalts?: Array<{ code: string; name?: string; time?: string }>;
  travelClass: string;
  travelClassName?: string;
  quota: string;
  quotaName?: string;
  distanceKm?: number | string | null;
  chartPrepared: boolean;
  bookingStatus: string;
  confirmationProbability?: number | null;
  passengers: PassengerStatus[];
  rakeComposition?: CoachRakeItem[];
  userCoach?: string | null;
  fare?: PnrFareDetails | null;
  cancellationTerms?: {
    summary?: string;
    currentRefundValue?: number | string | null;
  } | null;
  liveTrainStatus?: PnrLiveTrainStatus | null;
  telemetryFreshness?: {
    source: string;
    fetchedAt: string;
  };
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface ApiErrorResponse {
  error: ApiError;
  meta: ApiMeta;
}

// Provider Contracts (PRD Section 6.6)
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}
