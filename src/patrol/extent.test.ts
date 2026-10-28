import { describe, expect, it } from 'vitest';
import { createExcluder, distanceM, emptyExcluded, excludingSink } from './extent.ts';
import { detectFormat, readHeader } from './formats.ts';
import { readPatrol, type PatrolPoint } from './importer.ts';

const city = {
  extent: { bbox: [-118.37, 34.14, -118.27, 34.22] as [number, number, number, number] },
  exclusionZones: [{ lat: 34.2, lon: -118.35, radiusM: 200 }],
  depot: { lat: 34.18, lon: -118.31 },
};
const excluder = createExcluder(city, 100);

describe('extent and exclusion zones (FR-32)', () => {
  it('measures distance in metres', () => {
    expect(distanceM(34.18, -118.31, 34.18, -118.31)).toBe(0);
    expect(distanceM(34.18, -118.31, 34.181, -118.31)).toBeCloseTo(111.2, 0);
  });

  it('classifies points by reason', () => {
    expect(excluder(34.17, -118.3)).toBeUndefined();
    expect(excluder(35, -118.3)).toBe('Outside city extent');
    expect(excluder(34.1805, -118.3102)).toBe('Inside depot zone');
    expect(excluder(34.2005, -118.3502)).toBe('Inside exclusion zone');
    expect(excluder(34.18, -118.31 - 0.0015)).toBeUndefined(); // ~140 m from the depot
  });

  it('supports a polygon extent', () => {
    const tri = createExcluder({ ...city, extent: { polygon: [[-118.37, 34.14], [-118.27, 34.14], [-118.32, 34.22]] } }, 100);
    expect(tri(34.16, -118.32)).toBeUndefined();
    expect(tri(34.21, -118.28)).toBe('Outside city extent');
  });

  it('counts excluded points instead of rejecting them', () => {
    const csv = [
      'time,latitude,longitude,vehicle',
      '2025-03-11T10:00:00Z,34.17,-118.3,V1',
      '2025-03-11T10:00:30Z,35.0,-118.3,V1',
      '2025-03-11T10:01:00Z,34.1805,-118.3102,V1',
      '2025-03-11T10:01:30Z,34.2005,-118.3502,V1',
    ].join('\n');
    const d = detectFormat(readHeader(csv));
    const counts = emptyExcluded();
    const kept: PatrolPoint[] = [];
    const out = readPatrol(csv, d.format, d.mapping, { parseTime: Date.parse }, excludingSink(excluder, counts, (p) => kept.push(p)));
    expect(out.counts.rejected).toBe(0);
    expect(kept).toHaveLength(1);
    expect(counts).toEqual({ 'Outside city extent': 1, 'Inside exclusion zone': 1, 'Inside depot zone': 1 });
  });

  it('lets Format B address stops through for block matching', () => {
    const kept: PatrolPoint[] = [];
    const sink = excludingSink(excluder, emptyExcluded(), (p) => kept.push(p));
    sink({ format: 'B', vehicle: 'V', kind: 'start', time: 1, location: { address: '1 A St' } });
    sink({ format: 'B', vehicle: 'V', kind: 'end', time: 2, location: undefined });
    expect(kept).toHaveLength(2);
  });
});
