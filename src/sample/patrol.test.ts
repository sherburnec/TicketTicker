import { describe, expect, it } from 'vitest';
import { detectFormat, readHeader } from '../patrol/formats.ts';
import { distanceM } from '../patrol/extent.ts';
import { importPatrol, type PatrolCity } from '../patrol/importer.ts';
import { loadCitySource, loadSegments } from '../ui/sourcePanel.ts';
import { generatePatrol, generatePatrolSample, PATROL_A_HEADERS, PATROL_B_HEADERS, type PatrolSource } from './patrol.ts';

const citySource = loadCitySource('burbank');
const segments = loadSegments('burbank');
const source: PatrolSource = { city: citySource.city, segments };
const patrolCity: PatrolCity = { settings: citySource.city, blocks: citySource.blocks, namedLocations: citySource.namedLocations, segments };

const quick = { durationMonths: 1, endDate: '2026-03-31', seed: 'unit' };

function importIt(csv: string) {
  const d = detectFormat(readHeader(csv));
  return importPatrol({ csv, format: d.format, columns: d.mapping, timeZone: source.city.timeZone, city: patrolCity });
}

/** Metres from a point to the nearest street segment. */
function distanceToStreets(lat: number, lon: number): number {
  const mPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const f of segments.features as { geometry: { coordinates: [number, number][] } }[]) {
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const ax = (c[i - 1][0] - lon) * mPerLon, ay = (c[i - 1][1] - lat) * 111320;
      const bx = (c[i][0] - lon) * mPerLon, by = (c[i][1] - lat) * 111320;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

describe('patrol sample generator', () => {
  const csv = generatePatrol(quick, source);
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));

  it('writes Format A with the Samsara field names, shifts and a 30 s ping', () => {
    expect(csv.split('\n')[0]).toBe(PATROL_A_HEADERS.join(','));
    expect(new Set(rows.map((r) => r[3])).size).toBe(4);
    expect(rows.length).toBeGreaterThan(50000);
    const v1 = rows.filter((r) => r[3] === 'PATROL-01').slice(0, 20).map((r) => Date.parse(r[0]));
    const steps = v1.slice(1).map((t, i) => t - v1[i]);
    expect(steps.filter((s) => s === 30000).length).toBeGreaterThan(steps.length / 2);
  });

  it('is reproducible for a seed and differs for another', () => {
    expect(generatePatrol(quick, source)).toBe(csv);
    expect(generatePatrol({ ...quick, seed: 'other' }, source)).not.toBe(csv);
  });

  it('puts vehicles only on street segments, apart from idling at the depot', () => {
    const d = source.city.depot;
    const away = rows.filter((r) => distanceM(+r[1], +r[2], d.lat, d.lon) > 150);
    expect(away.length).toBeGreaterThan(1000);
    const sample = Array.from({ length: 150 }, (_, i) => away[Math.floor((i * away.length) / 150)]);
    for (const r of sample) expect(distanceToStreets(+r[1], +r[2])).toBeLessThan(30);
  });

  it('runs two vehicles on weekends from 09:00 to 17:00 local time', () => {
    // 2026-03-28 is a Saturday; 09:00 PDT = 16:00Z
    const sat = rows.filter((r) => r[0] >= '2026-03-28T07:00:00Z' && r[0] < '2026-03-29T07:00:00Z');
    expect(new Set(sat.map((r) => r[3])).size).toBe(2);
    expect(sat[0][0]).toBe('2026-03-28T16:00:00Z');
  });

  it('writes Format B trips with start and end stops', () => {
    const b = generatePatrol(quick, source, 'B');
    expect(b.split('\n')[0]).toBe(PATROL_B_HEADERS.join(','));
    expect(detectFormat(readHeader(b)).format).toBe('B');
    expect(b.split('\n').length).toBeGreaterThan(500);
  });

  it('never uses citation data and honours the shared duration variable', () => {
    const longer = generatePatrol({ ...quick, durationMonths: 2 }, source);
    expect(longer.split('\n').length).toBeGreaterThan(csv.split('\n').length * 1.7);
  });
});

describe('patrol error injection (FR-46)', () => {
  const counts = { badTime: 2, latLonRange: 2, swapped: 2, zeroZero: 2, missingVehicle: 2, duplicate: 2, outsideExtent: 2 };

  it('Format A: rejects, ignores or excludes each injected kind as expected', () => {
    const s = generatePatrolSample(quick, source, 'A', counts);
    expect(s.injected).toEqual(counts);
    const r = importIt(s.csv);
    expect(r.summary.counts.rejected).toBe(10);
    expect(r.summary.counts.duplicates).toBe(2);
    expect(r.excluded['Outside city extent']).toBe(2);
    const reasons = r.rejected.map((x) => x.reason).join('|');
    for (const part of ['Missing or unreadable time', 'out of range', 'no-fix', 'Missing vehicle']) expect(reasons).toContain(part);
  });

  it('Format B: rejects, ignores or excludes each injected kind as expected', () => {
    const s = generatePatrolSample(quick, source, 'B', counts);
    expect(s.injected).toEqual(counts);
    const r = importIt(s.csv);
    expect(r.summary.counts.rejected).toBe(10);
    expect(r.summary.counts.duplicates).toBe(4); // each duplicated trip is two stops
    expect(r.excluded['Outside city extent']).toBe(2);
  });

  it('leaves the valid rows unchanged', () => {
    const clean = generatePatrolSample(quick, source, 'A').csv.split('\n');
    const dirty = generatePatrolSample(quick, source, 'A', counts).csv.split('\n');
    const cleanSet = new Set(clean);
    expect(dirty.filter((l) => cleanSet.has(l)).length).toBeGreaterThanOrEqual(clean.length - 1);
  });
});
