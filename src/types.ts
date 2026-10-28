export type Bbox = [west: number, south: number, east: number, north: number];
export type Polygon = [lon: number, lat: number][];

export interface ExclusionZone {
  lat: number;
  lon: number;
  radiusM: number;
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
