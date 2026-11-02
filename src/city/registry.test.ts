import { describe, expect, it } from 'vitest';
import { listCities } from './registry.ts';

const fixtures = import.meta.glob('/tests/fixtures/cities/*/city.json', { eager: true, import: 'default' });
const sources = import.meta.glob(['/src/**/*.ts', '!/src/**/*.test.ts'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

describe('listCities', () => {
  it('lists the bundled cities by name', () => {
    const cities = listCities();
    expect(cities.find((c) => c.id === 'burbank')).toEqual({ id: 'burbank', name: 'Burbank, CA' });
    expect(cities.map((c) => c.name)).toEqual([...cities.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('lists a fixture folder too, sorted by name', () => {
    const cities = listCities({ ...fixtures, '/data/burbank/city.json': listCitiesFile('burbank') });
    expect(cities.map((c) => c.id)).toEqual(['burbank', 'testville']);
  });

  it('names no city id in quotes outside the registry', () => {
    const ids = [...listCities().map((c) => c.id), 'testville'];
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/city/registry.ts'))
      .flatMap(([path, text]) => ids.filter((id) => new RegExp(`['"\`]${id}['"\`]`).test(text)).map((id) => `${path}: ${id}`));
    expect(offenders).toEqual([]);
  });
});

function listCitiesFile(id: string): unknown {
  const all = import.meta.glob('/data/*/city.json', { eager: true, import: 'default' });
  return all[`/data/${id}/city.json`];
}
