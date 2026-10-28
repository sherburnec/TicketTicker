import { PATROL_DEFAULTS } from './config.ts';
import type { PatrolFormat } from './formats.ts';
import type { PatrolPoint } from './importer.ts';
import { isoDate, type ZoneClock } from './time.ts';

const M_PER_DEG_LAT = 111320;

/** Speed at or above this many mph counts as moving, for the R8 moving/stopped filter. [Proposed] */
export const MOVING_MPH = 1;

export type Motion = 'm' | 's' | '-';

/**
 * Patrol presence as a sparse count by grid cell, local date, hour, vehicle and motion (FR-38, FR-39). Keys are
 * `${cx}:${cy}|${date}|${hour}|${vehicleIndex}|${motion}`; values are minutes of presence (Format A) or stop
 * counts (Format B). No raw points are kept.
 */
export interface PatrolAggregate {
  format: PatrolFormat;
  unit: 'minutes' | 'stops';
  gridMeters: number;
  /** South-west corner the grid is measured from. */
  origin: { lat: number; lon: number };
  timeZone: string;
  /** Vehicle ids by index, used only for the R8 display filter (FR-39). */
  vehicles: string[];
  cells: Map<string, number>;
}

export interface UnmatchedStop {
  address: string;
  count: number;
}

export interface AggregateResult {
  aggregate: PatrolAggregate;
  /** Format A: median seconds between a vehicle's consecutive pings, gaps excluded (FR-36). */
  medianPingSeconds?: number;
  /** Format B stops whose address could not be placed on a block (DR-14). */
  unmatched: UnmatchedStop[];
}

export interface AggregatorOptions {
  format: PatrolFormat;
  clock: ZoneClock;
  /** South-west corner of the grid; the city extent's corner. */
  origin: { lat: number; lon: number };
  gridMeters?: number;
  gapMinutes?: number;
  /** Format B: coordinates for an address text, or undefined when no block matches (FR-37). */
  placeAddress?: (address: string) => { lat: number; lon: number } | undefined;
}

/** Cell index for a coordinate on the grid. */
export function cellOf(lat: number, lon: number, origin: { lat: number; lon: number }, gridMeters: number): [number, number] {
  const mPerLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [Math.floor(((lon - origin.lon) * mPerLon) / gridMeters), Math.floor(((lat - origin.lat) * M_PER_DEG_LAT) / gridMeters)];
}

/** Centre of a cell as longitude and latitude, for drawing the heatmap. */
export function cellCenter(cx: number, cy: number, origin: { lat: number; lon: number }, gridMeters: number): [lon: number, lat: number] {
  const mPerLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [origin.lon + ((cx + 0.5) * gridMeters) / mPerLon, origin.lat + ((cy + 0.5) * gridMeters) / M_PER_DEG_LAT];
}

/** Midpoint of each street segment's vertices by segment id, to place a block-matched Format B stop. */
export function segmentCentroids(segments: { features: unknown[] }): Map<string, { lat: number; lon: number }> {
  const out = new Map<string, { lat: number; lon: number }>();
  for (const f of segments.features as { properties: { segment_id: string }; geometry: { coordinates: [number, number][] } }[]) {
    const pts = f.geometry.coordinates;
    if (pts.length === 0) continue;
    out.set(f.properties.segment_id, { lon: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length });
  }
  return out;
}

interface Pending {
  time: number;
  key: string;
}

/**
 * Folds validated points into a `PatrolAggregate` as they arrive (FR-36, FR-37, FR-38).
 * Format A: each point is weighted by the time to the same vehicle's next point; a gap longer than the threshold is
 * attributed to nothing, and the point before a gap or at the end of a sequence is weighted by the median ping interval.
 * Format B: each trip start and end is one stop.
 */
export function createAggregator(opts: AggregatorOptions) {
  const grid = opts.gridMeters ?? PATROL_DEFAULTS.gridMeters;
  const gapMs = (opts.gapMinutes ?? PATROL_DEFAULTS.gapMinutes) * 60000;
  const cells = new Map<string, number>();
  const vehicleIndex = new Map<string, number>();
  const vehicles: string[] = [];
  const pending = new Map<number, Pending>();
  const tails = new Map<string, number>();
  const intervals = new Map<number, number>();
  const unmatched = new Map<string, number>();
  const dates = new Map<number, string>();

  const vehicleOf = (id: string) => {
    let i = vehicleIndex.get(id);
    if (i === undefined) {
      i = vehicles.push(id) - 1;
      vehicleIndex.set(id, i);
    }
    return i;
  };
  const add = (key: string, value: number) => cells.set(key, (cells.get(key) ?? 0) + value);
  const keyFor = (time: number, cx: number, cy: number, vehicle: number, motion: Motion) => {
    const { day, hour } = opts.clock.local(time);
    let date = dates.get(day);
    if (date === undefined) dates.set(day, (date = isoDate(day)));
    return `${cx}:${cy}|${date}|${hour}|${vehicle}|${motion}`;
  };

  function addA(p: Extract<PatrolPoint, { format: 'A' }>): void {
    const v = vehicleOf(p.vehicle);
    const [cx, cy] = cellOf(p.lat, p.lon, opts.origin, grid);
    const motion: Motion = p.speed === undefined ? '-' : p.speed >= MOVING_MPH ? 'm' : 's';
    const prev = pending.get(v);
    if (prev) {
      const dt = p.time - prev.time;
      if (dt <= gapMs) {
        add(prev.key, dt / 60000);
        const s = Math.round(dt / 1000);
        intervals.set(s, (intervals.get(s) ?? 0) + 1);
      } else tails.set(prev.key, (tails.get(prev.key) ?? 0) + 1);
    }
    pending.set(v, { time: p.time, key: keyFor(p.time, cx, cy, v, motion) });
  }

  function addB(p: Extract<PatrolPoint, { format: 'B' }>): void {
    const v = vehicleOf(p.vehicle);
    let at: { lat: number; lon: number } | undefined;
    if (p.location && 'lat' in p.location) at = p.location;
    else {
      const address = p.location?.address ?? '(blank location)';
      at = p.location ? opts.placeAddress?.(address) : undefined;
      if (!at) {
        unmatched.set(address, (unmatched.get(address) ?? 0) + 1);
        return;
      }
    }
    const [cx, cy] = cellOf(at.lat, at.lon, opts.origin, grid);
    add(keyFor(p.time, cx, cy, v, '-'), 1);
  }

  return {
    add(p: PatrolPoint): void {
      if (p.format === 'A') addA(p);
      else addB(p);
    },
    /** Settles the last point of every vehicle and returns the aggregate. Call once. */
    finish(): AggregateResult {
      let median: number | undefined;
      const total = [...intervals.values()].reduce((a, b) => a + b, 0);
      if (total > 0) {
        let seen = 0;
        for (const s of [...intervals.keys()].sort((a, b) => a - b)) {
          seen += intervals.get(s)!;
          if (seen >= total / 2) {
            median = s;
            break;
          }
        }
      }
      if (median !== undefined) {
        for (const [key, n] of tails) add(key, (n * median) / 60);
        for (const last of pending.values()) add(last.key, median / 60);
      }
      pending.clear();
      tails.clear();
      return {
        aggregate: {
          format: opts.format,
          unit: opts.format === 'A' ? 'minutes' : 'stops',
          gridMeters: grid,
          origin: opts.origin,
          timeZone: opts.clock.zone,
          vehicles,
          cells,
        },
        medianPingSeconds: median,
        unmatched: [...unmatched].map(([address, count]) => ({ address, count })).sort((a, b) => b.count - a.count || a.address.localeCompare(b.address)),
      };
    },
  };
}
