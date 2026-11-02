import { describe, expect, it } from 'vitest';
import { listCities } from '../../src/city/registry.ts';
import { streetKey } from '../../src/geo/normalize.ts';
import { generateCitations } from '../../src/sample/citations.ts';
import { loadCitySource, loadSegments } from '../../src/ui/sourcePanel.ts';

// Cross-city checks (K17, K19): the app lists both cities, every sample stays on its own city's streets and codes, and the share of
// blocks that carry a number is reported so a city with poor coverage is visible (Malibu against Burbank).
const cities = listCities();

describe('registry', () => {
  it('lists Burbank and Malibu', () => {
    expect(cities.map((c) => c.id).sort()).toEqual(['burbank', 'malibu']);
  });
});

describe.each(cities)('$name', ({ id }) => {
  const source = loadCitySource(id);

  it('draws sample addresses and codes only from its own files', () => {
    const csv = generateCitations({ durationMonths: 1, seed: 'cities' }, source);
    const streets = new Set(source.blocks.map((b) => streetKey(b.street)));
    const codes = new Set(source.schedule.map((e) => e.code));
    const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(codes.has(r[3]), r[3]).toBe(true);
      expect(streets.has(streetKey(r[9].replace(/^\d+[A-Za-z]?\s+/, ''))), r[9]).toBe(true);
    }
  });

  it('reports its block numbering coverage', () => {
    const numbered = source.blocks.filter((b) => b.blockNumber !== null).length;
    const rate = numbered / source.blocks.length;
    const features = (loadSegments(id).features as unknown[]).length;
    console.log(`${id}: ${numbered} of ${source.blocks.length} blocks numbered (${(rate * 100).toFixed(1)}%), ${features} segments`);
    expect(source.blocks).toHaveLength(features);
    expect(numbered).toBeGreaterThan(0);
  });
});
