import { describe, expect, it } from 'vitest';
import { buildMatchIndex, type BlockInfo } from '../geo/matcher.ts';
import type { Citation, NamedLocation } from '../types.ts';
import { createR3State, R3_NOTICE } from '../ui/r3Panel.ts';
import { blockCentroids, buildHotspots, hotspotFeatures, pinFeatures } from './r3.ts';

const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const blocks: BlockInfo[] = ids.map((id, i) => ({
  id: `seg-${id}`, street: `${id} Street`, blockNumber: (i + 1) * 100, lowAddress: null, highAddress: null,
}));
const seg = (id: string, x: number) => ({
  type: 'Feature', properties: { segment_id: `seg-${id}`, street: `${id} Street` },
  geometry: { type: 'LineString', coordinates: [[x, 34], [x + 0.002, 34.002]] },
});
const segments = { type: 'FeatureCollection' as const, features: ids.map((id, i) => seg(id, -118.3 + i * 0.01)) };
const named: NamedLocation[] = [
  { id: 'L1', name: 'Mall', addresses: ['100 A Street'] },
  { id: 'L2', name: 'Plaza', addresses: ['1 Nowhere Rd'], lat: 34.5, lon: -118.5 },
  { id: 'L3', name: 'Lost', addresses: ['9 Nowhere Rd'] },
];

let n = 0;
const cit = (block: string | undefined, date = '2025-03-03', time = '09:00', extra: Partial<Citation> = {}): Citation => ({
  id: `C${++n}`, date, time, code: 'CVC-1', officer: '1', result: 'Paid', fineAmount: 50, address: '1 X', flags: [],
  blockId: block ? `seg-${block}` : undefined, ...extra,
});
// Mondays 09:00 unless stated. Counts: A 6, B 5, C 4, D 3, E 2, F 1; G none; one unmatched.
const data: Citation[] = [
  ...Array.from({ length: 6 }, () => cit('A', '2025-03-03', '09:00', { namedLocationId: 'L1' })),
  ...Array.from({ length: 5 }, () => cit('B')),
  ...Array.from({ length: 4 }, () => cit('C')),
  ...Array.from({ length: 3 }, () => cit('D')),
  ...Array.from({ length: 2 }, () => cit('E')),
  cit('F', '2025-03-04', '14:00'),
  cit(undefined),
];

describe('R3 hotspots', () => {
  const index = buildMatchIndex(blocks, named);
  const h = buildHotspots(data, blocks, named, index, blockCentroids(segments));

  it('ranks the top 5 blocks', () => {
    expect(h.ranked.slice(0, 5).map((r) => [r.blockId, r.count])).toEqual([
      ['seg-A', 6], ['seg-B', 5], ['seg-C', 4], ['seg-D', 3], ['seg-E', 2],
    ]);
    expect(h.ranked[0].label).toBe('100 block of A Street');
    expect(h.unmatched).toBe(1);
  });
  it('places a pin by coordinates, else by the matched block, else not at all', () => {
    expect(h.pins.map((p) => [p.id, p.count])).toEqual([['L1', 6], ['L2', 0]]);
    expect(h.pins[1]).toMatchObject({ lon: -118.5, lat: 34.5 });
    expect(h.pins[0].lon).toBeCloseTo(-118.299, 3);
    expect(pinFeatures(h.pins).features).toHaveLength(2);
  });
  it('tags only blocks with citations for the map layer', () => {
    const f = hotspotFeatures(segments, h.counts).features as { properties: { segment_id: string; count: number } }[];
    expect(f).toHaveLength(6);
    expect(f.find((x) => x.properties.segment_id === 'seg-A')!.properties.count).toBe(6);
  });
});

describe('R3 day and hour filters update the map data', () => {
  const state = createR3State(() => ({ citations: data, blocks, namedLocations: named, segments }));
  const mapCount = () => (state.view()!.map.hotspots.features as unknown[]).length;

  it('has no view without data', () => {
    expect(createR3State(() => undefined).view()).toBeUndefined();
  });
  it('narrows by day and by hour', () => {
    expect(mapCount()).toBe(6);
    state.setDay(2); // Tuesday: only block F
    expect(mapCount()).toBe(1);
    expect(state.view()!.hotspots.ranked[0].blockId).toBe('seg-F');
    state.setDay(undefined);
    state.setHour(14);
    expect(mapCount()).toBe(1);
    state.setHour(9);
    expect(mapCount()).toBe(5);
    state.setDay(1);
    expect(state.view()!.hotspots.ranked[0]).toMatchObject({ blockId: 'seg-A', count: 6 });
    state.setHour(3);
    expect(mapCount()).toBe(0);
  });
});

describe('R3 notice', () => {
  it('states that citations reflect enforcement activity, not violation rates (FR-25)', () => {
    expect(R3_NOTICE).toMatch(/enforcement activity, not violation rates/);
  });
});
