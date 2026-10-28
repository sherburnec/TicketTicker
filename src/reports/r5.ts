import type { Citation } from '../types.ts';
import { hourOf } from './filters.ts';

/** RPT-3: R5 is a proxy built from citation data, never measured patrol effort. */
export const R5_PROXY_LABEL =
  'Proxy for patrol coverage, inferred only from where citations were written. It is not measured patrol effort; blank areas may be unpatrolled or simply quiet.';

export interface Coverage {
  officers: string[];
  /** hours[officer][hour] = citations recorded by that officer in that hour of the day. */
  hours: Map<string, number[]>;
  /** Blocks where the selected officer recorded citations in the selected hours, with counts. */
  footprint: Map<string, number>;
}

/**
 * R5 Coverage footprint (internal only, FR-24): where each officer number was recorded, by hour.
 * `officer` picks whose blocks make the footprint; `hours` limits it to those hours of the day (all when empty).
 */
export function buildCoverage(citations: Citation[], officer?: string, hours: number[] = []): Coverage {
  const byHour = new Map<string, number[]>();
  const footprint = new Map<string, number>();
  for (const c of citations) {
    let row = byHour.get(c.officer);
    if (!row) byHour.set(c.officer, (row = new Array<number>(24).fill(0)));
    const h = hourOf(c.time);
    row[h]++;
    if (c.officer === officer && c.blockId && (hours.length === 0 || hours.includes(h))) {
      footprint.set(c.blockId, (footprint.get(c.blockId) ?? 0) + 1);
    }
  }
  return { officers: [...byHour.keys()].sort(), hours: byHour, footprint };
}
