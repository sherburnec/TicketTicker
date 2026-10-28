export type Bbox = [west: number, south: number, east: number, north: number];
export type Polygon = [lon: number, lat: number][];

export interface ExclusionZone {
  lat: number;
  lon: number;
  radiusM: number;
}

export interface FineEntry {
  /** The key, e.g. "CVC-22500(g)". The prefix before "-" is the code source. */
  code: string;
  name: string;
  base: number;
  escalated: number;
  /** ISO date; absent means the entry is the baseline for its code. */
  startDate?: string;
  /** Overrides the city payment window for this entry. */
  escalationDays?: number;
  /** Relative frequency for the sample generator; absent means equal. */
  sampleWeight?: number;
}

export interface NamedLocation {
  id: string;
  name: string;
  addresses: string[];
  lat?: number;
  lon?: number;
  notes?: string;
}

export interface CitySettings {
  id: string;
  name: string;
  timeZone: string;
  paymentWindowDays: number;
  extent: { bbox: Bbox } | { polygon: Polygon };
  exclusionZones: ExclusionZone[];
  depot: { lat: number; lon: number };
  hotZoneWeights?: { lat: number; lon: number; weight: number }[];
}
