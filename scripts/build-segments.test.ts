import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertWritable, buildSegments, clipRuns, insideExtent, type Extent, type OsmWay, type SegmentFeature } from './build-segments.ts';

const BBOX = { bbox: [0, 0, 1, 1] as [number, number, number, number] };

/** A way along the given node ids; each node's position comes from `at`. */
const at: Record<number, [number, number]> = {
  1: [0.1, 0.5], 2: [0.3, 0.5], 3: [0.5, 0.5], 4: [0.7, 0.5], 5: [0.9, 0.5],
  11: [0.5, 0.1], 12: [0.5, 0.3], 13: [0.5, 0.7], 14: [0.5, 0.9],
};
function way(id: number, name: string | undefined, nodes: number[], highway = 'residential'): OsmWay {
  return { id, tags: { ...(name ? { name } : {}), highway }, nodes, geometry: nodes.map((n) => ({ lon: at[n][0], lat: at[n][1] })) };
}

describe('buildSegments', () => {
  it('splits a street at the intersection with another and names both ends', () => {
    const f = buildSegments([way(100, 'Main Street', [1, 2, 3, 4, 5]), way(200, 'Oak Avenue', [11, 12, 3, 13, 14])], 'fix', BBOX);
    const main = f.filter((x) => x.properties.street === 'Main Street').map((x) => x.properties);
    expect(main).toEqual([
      { segment_id: 'fix-1-3', street: 'Main Street', from_street: '', to_street: 'Oak Avenue', city_id: 'fix' },
      { segment_id: 'fix-3-5', street: 'Main Street', from_street: 'Oak Avenue', to_street: '', city_id: 'fix' },
    ]);
    expect(f).toHaveLength(4);
    expect(f[0].geometry.type).toBe('LineString');
  });

  it('joins ways of the same street that meet end to end', () => {
    const f = buildSegments([way(100, 'Main Street', [1, 2, 3]), way(101, 'Main Street', [5, 4, 3])], 'fix', BBOX);
    expect(f).toHaveLength(1);
    expect(f[0].properties.segment_id).toBe('fix-1-5');
    expect(f[0].geometry.coordinates).toEqual([at[1], at[2], at[3], at[4], at[5]]);
  });

  it('drops unnamed and non-drivable ways', () => {
    const f = buildSegments([way(1, undefined, [1, 2]), way(2, 'Trail', [2, 3], 'footway'), way(3, 'Drive', [3, 4], 'service'), way(4, 'Real Road', [4, 5], 'tertiary')], 'fix', BBOX);
    expect(f.map((x) => x.properties.street)).toEqual(['Real Road']);
  });

  it('prefixes every id with the city id', () => {
    const f = buildSegments([way(100, 'Main Street', [1, 2, 3])], 'malibu', BBOX);
    expect(f.every((x) => x.properties.segment_id.startsWith('malibu-') && x.properties.city_id === 'malibu')).toBe(true);
  });

  it('keeps ids unique when two segments join the same pair of nodes', () => {
    const f = buildSegments([way(1, 'Loop Road', [1, 2, 3]), way(2, 'Loop Road Alt', [1, 4, 3])], 'fix', BBOX);
    expect(new Set(f.map((x) => x.properties.segment_id)).size).toBe(f.length);
  });

  it('is deterministic', () => {
    const ways = [way(100, 'Main Street', [1, 2, 3, 4, 5]), way(200, 'Oak Avenue', [11, 12, 3, 13, 14])];
    expect(buildSegments(ways, 'fix', BBOX)).toEqual(buildSegments([...ways].reverse(), 'fix', BBOX));
  });
});

describe('extent', () => {
  it('trims a way at the extent so every vertex is inside', () => {
    const w: OsmWay = { id: 1, tags: { name: 'Out Road', highway: 'primary' }, nodes: [1, 2, 3], geometry: [{ lon: 0.5, lat: 0.5 }, { lon: 0.9, lat: 0.5 }, { lon: 1.5, lat: 0.5 }] };
    const runs = clipRuns(w, BBOX);
    expect(runs).toHaveLength(1);
    expect(runs[0].nodes).toEqual([1, 2]);
    for (const f of buildSegments([w], 'fix', BBOX)) for (const [lon, lat] of f.geometry.coordinates) expect(insideExtent(BBOX, lon, lat)).toBe(true);
  });

  it('supports polygon extents', () => {
    const tri = { polygon: [[0, 0], [1, 0], [0, 1]] as [number, number][] };
    expect(insideExtent(tri, 0.2, 0.2)).toBe(true);
    expect(insideExtent(tri, 0.8, 0.8)).toBe(false);
  });
});

describe('assertWritable', () => {
  it('never overwrites Burbank, and needs force to replace another city', () => {
    expect(() => assertWritable('burbank', true, true)).toThrow(/burbank/i);
    expect(() => assertWritable('malibu', true, false)).toThrow(/force/);
    expect(() => assertWritable('malibu', true, true)).not.toThrow();
    expect(() => assertWritable('malibu', false, false)).not.toThrow();
  });
});

describe('Malibu segments file', () => {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'malibu', 'segments.geojson');
  const extent: Extent = { bbox: [-118.95, 33.99, -118.55, 34.09] }; // the approved extent in data/malibu/SOURCES.md
  const features: SegmentFeature[] = JSON.parse(readFileSync(file, 'utf8')).features;

  it('has the coastline and canyon streets', () => {
    const streets = new Set(features.map((f) => f.properties.street));
    for (const s of ['Pacific Coast Highway', 'Malibu Canyon Road', 'Kanan Dume Road', 'Las Flores Canyon Road']) expect(streets.has(s), s).toBe(true);
  });

  it('lies inside the extent, with unique city-prefixed ids', () => {
    for (const f of features) for (const [lon, lat] of f.geometry.coordinates) expect(insideExtent(extent, lon, lat)).toBe(true);
    expect(new Set(features.map((f) => f.properties.segment_id)).size).toBe(features.length);
    expect(features.every((f) => f.properties.segment_id.startsWith('malibu-') && f.properties.city_id === 'malibu')).toBe(true);
  });
});
