import { describe, expect, it } from 'vitest';
import { buildMatchIndex, matchAddress, type BlockInfo } from '../geo/matcher.ts';
import { cellCenter, cellOf, createAggregator, segmentCentroids, type PatrolAggregate } from './aggregate.ts';
import type { PatrolPoint } from './importer.ts';
import { zoneClock } from './time.ts';

const origin = { lat: 34.14, lon: -118.37 };
const clock = zoneClock('America/Los_Angeles');
const t0 = Date.parse('2025-03-11T17:00:00Z'); // 10:00 PDT, Tuesday
const a = (vehicle: string, sec: number, lat = 34.18, lon = -118.3, speed?: number): PatrolPoint => ({
  format: 'A', vehicle, time: t0 + sec * 1000, lat, lon, ...(speed === undefined ? {} : { speed }),
});
const minutes = (agg: PatrolAggregate) => [...agg.cells.values()].reduce((s, v) => s + v, 0);

function runA(points: PatrolPoint[], gapMinutes?: number) {
  const g = createAggregator({ format: 'A', clock, origin, gapMinutes });
  points.forEach((p) => g.add(p));
  return g.finish();
}

describe('Format A aggregation (FR-36, FR-38)', () => {
  it('weights each point by the time to the vehicle\'s next point', () => {
    // pings every 30 s for 2 minutes: 4 intervals of 0.5 min, plus the last point at the median (0.5 min)
    const r = runA([0, 30, 60, 90, 120].map((s) => a('V1', s)));
    expect(minutes(r.aggregate)).toBeCloseTo(2.5, 10);
    expect(r.medianPingSeconds).toBe(30);
    expect(r.aggregate.unit).toBe('minutes');
  });

  it('attributes nothing to a gap longer than the threshold; the point before it gets the median', () => {
    const r = runA([a('V1', 0), a('V1', 30), a('V1', 30 + 600, 34.17, -118.29)]);
    // 0.5 (first dwell) + 0.5 (before the gap, median) + 0.5 (last point, median); the 10-minute gap adds nothing
    expect(minutes(r.aggregate)).toBeCloseTo(1.5, 10);
  });

  it('honours a configured gap threshold', () => {
    const pts = [a('V1', 0), a('V1', 120), a('V1', 240)];
    expect(minutes(runA(pts, 1).aggregate)).toBeCloseTo(0, 10); // no interval qualifies, so no median either
    expect(minutes(runA(pts, 5).aggregate)).toBeCloseTo(2 + 2 + 2, 10);
  });

  it('orders points per vehicle, so interleaved vehicles do not interrupt each other', () => {
    const r = runA([a('V1', 0), a('V2', 10), a('V1', 30), a('V2', 40)]);
    expect(minutes(r.aggregate)).toBeCloseTo(2, 10); // each vehicle: 0.5 dwell + 0.5 last
    expect(r.aggregate.vehicles).toEqual(['V1', 'V2']);
  });

  it('assigns the local date and hour, and separates moving from stopped', () => {
    const r = runA([a('V1', 0, 34.18, -118.3, 20), a('V1', 30, 34.18, -118.3, 0)]);
    const keys = [...r.aggregate.cells.keys()];
    expect(keys.every((k) => k.includes('|2025-03-11|10|0|'))).toBe(true);
    expect(keys.some((k) => k.endsWith('|m'))).toBe(true);
    expect(keys.some((k) => k.endsWith('|s'))).toBe(true);
  });

  it('keeps no raw points: the aggregate is sparse by cell', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => a('V1', i * 30));
    const r = runA(pts);
    expect(r.aggregate.cells.size).toBe(42); // one per local hour over ~41.7 h, not one per point
    expect(Object.keys(r.aggregate).sort()).toEqual(['cells', 'format', 'gridMeters', 'origin', 'timeZone', 'unit', 'vehicles']);
    expect(minutes(r.aggregate)).toBeCloseTo(2500, 6);
  });
});

describe('grid', () => {
  it('maps coordinates to cells and back to within one cell', () => {
    const [cx, cy] = cellOf(34.18, -118.3, origin, 25);
    const [lon, lat] = cellCenter(cx, cy, origin, 25);
    expect(Math.abs(lat - 34.18)).toBeLessThan(25 / 111320);
    expect(Math.abs(lon - -118.3)).toBeLessThan(0.0004);
    expect(cellOf(34.18, -118.3, origin, 25)).toEqual(cellOf(34.18000001, -118.30000001, origin, 25));
  });
});

describe('Format B aggregation (FR-37)', () => {
  const blocks: BlockInfo[] = [{ id: 'seg-A', street: 'Main Street', blockNumber: 100, lowAddress: null, highAddress: null }];
  const segments = { features: [{ properties: { segment_id: 'seg-A' }, geometry: { coordinates: [[-118.3, 34.18], [-118.302, 34.182]] } }] };
  const index = buildMatchIndex(blocks, []);
  const centroids = segmentCentroids(segments);
  const placeAddress = (address: string) => {
    const id = matchAddress(address, index).blockId;
    return id ? centroids.get(id) : undefined;
  };
  const b = (kind: 'start' | 'end', sec: number, location: Extract<PatrolPoint, { format: 'B' }>['location']): PatrolPoint => ({
    format: 'B', vehicle: 'V1', kind, time: t0 + sec * 1000, location,
  });

  it('counts each start and end as one stop, placing addresses on the matched block', () => {
    const g = createAggregator({ format: 'B', clock, origin, placeAddress });
    g.add(b('start', 0, { lat: 34.17, lon: -118.29 }));
    g.add(b('end', 600, { address: '150 Main St' }));
    g.add(b('end', 900, { address: '9 Nowhere Rd' }));
    g.add(b('end', 1200, { address: '9 Nowhere Rd' }));
    g.add(b('end', 1500, undefined));
    const r = g.finish();
    expect(r.aggregate.unit).toBe('stops');
    expect(minutes(r.aggregate)).toBe(2);
    expect(r.unmatched).toEqual([{ address: '9 Nowhere Rd', count: 2 }, { address: '(blank location)', count: 1 }]);
  });
});
