import type { CitySettings } from '../types.ts';
import type { PatrolPoint } from './importer.ts';

export type ExcludeReason = 'Outside city extent' | 'Inside exclusion zone' | 'Inside depot zone';

export type ExcludedCounts = Record<ExcludeReason, number>;

export const emptyExcluded = (): ExcludedCounts => ({ 'Outside city extent': 0, 'Inside exclusion zone': 0, 'Inside depot zone': 0 });

const EARTH_M = 6371000;

/** Distance in metres between two points; accurate to well under a metre at city scale. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dx = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const dy = (lat2 - lat1) * rad;
  return Math.hypot(dx, dy) * EARTH_M;
}

function inPolygon(lon: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Decides whether a point is kept (FR-32). Points outside the city extent or inside an exclusion zone or the depot
 * are excluded, not rejected, and reported with the reason. The depot is a point in city settings, so the radius
 * around it is a parameter (plan OQ11 is open).
 */
export function createExcluder(city: Pick<CitySettings, 'extent' | 'exclusionZones' | 'depot'>, depotRadiusM: number) {
  const extent = city.extent;
  return (lat: number, lon: number): ExcludeReason | undefined => {
    const inside =
      'bbox' in extent
        ? lon >= extent.bbox[0] && lat >= extent.bbox[1] && lon <= extent.bbox[2] && lat <= extent.bbox[3]
        : inPolygon(lon, lat, extent.polygon);
    if (!inside) return 'Outside city extent';
    if (distanceM(lat, lon, city.depot.lat, city.depot.lon) <= depotRadiusM) return 'Inside depot zone';
    for (const z of city.exclusionZones) if (distanceM(lat, lon, z.lat, z.lon) <= z.radiusM) return 'Inside exclusion zone';
    return undefined;
  };
}

/**
 * Wraps a point sink so excluded points are counted by reason and dropped. Format B stops given as address text
 * have no coordinates yet and pass through; they are placed on a block later (FR-37).
 */
export function excludingSink(
  excluder: ReturnType<typeof createExcluder>,
  counts: ExcludedCounts,
  next: (point: PatrolPoint) => void,
): (point: PatrolPoint) => void {
  return (p) => {
    const at = p.format === 'A' ? p : p.location && 'lat' in p.location ? p.location : undefined;
    const reason = at ? excluder(at.lat, at.lon) : undefined;
    if (reason) counts[reason]++;
    else next(p);
  };
}
