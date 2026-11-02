import { describe, expect, it } from 'vitest';
import { listCities } from './registry.ts';
import { loadCitySource, bundledCityFiles } from '../ui/sourcePanel.ts';
import { codeSource } from './schedule.ts';
import { generateCitations } from '../sample/citations.ts';

const fixtureText = import.meta.glob('/tests/fixtures/cities/*/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const fixtureCities = import.meta.glob('/tests/fixtures/cities/*/city.json', { eager: true, import: 'default' });
const fixtures = { text: fixtureText, cities: fixtureCities };

const REQUIRED = ['city.json', 'segments.geojson', 'blocks.csv', 'fine-schedule.csv', 'named-locations.csv'];

describe('city data folders', () => {
  it.each(listCities())('$id has all five required files and loads', ({ id }) => {
    for (const f of REQUIRED) expect(Object.keys(bundledCityFiles.text).concat(`/data/${id}/city.json`), f).toContain(`/data/${id}/${f}`);
    const source = loadCitySource(id);
    expect(source.city.id).toBe(id);
    expect(source.blocks.length).toBeGreaterThan(0);
  });

  it.each(listCities())('$id has a non-empty fine schedule', ({ id }) => {
    expect(loadCitySource(id).schedule.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED.filter((f) => f !== 'city.json'))('a city missing %s gets an error naming the file', (name) => {
    const text = Object.fromEntries(Object.entries(fixtureText).filter(([k]) => !k.endsWith(`/testville/${name}`)));
    expect(() => loadCitySource('testville', { text, cities: fixtureCities })).toThrow(new RegExp(`testville.*${name.replace('.', '\.')}`));
  });

  it('a city missing city.json gets an error naming the file', () => {
    expect(() => loadCitySource('testville', { text: fixtureText, cities: {} })).toThrow(/city\.json/);
  });
});

describe('per-city fine schedule', () => {
  const source = loadCitySource('testville', fixtures);

  it('loads a schedule written in the city\'s own code styles', () => {
    expect(source.schedule.map((e) => e.code)).toEqual(['TVC-4.12', 'TVC 7.3.1', 'TVC-4.12', 'LOCAL9']);
    expect(source.schedule.map((e) => codeSource(e.code))).toEqual(['TVC', 'TVC', 'TVC', 'LOCAL9']);
  });

  it('draws a seeded sample only from the city\'s own codes', () => {
    const csv = generateCitations({ durationMonths: 1, seed: 'own-codes' }, source);
    const codes = new Set(csv.split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[3]));
    const own = new Set(source.schedule.map((e) => e.code));
    expect(codes.size).toBeGreaterThan(1);
    for (const c of codes) expect(own.has(c), c).toBe(true);
    expect(codes.has('CVC-22500(g)')).toBe(false);
  });
});
