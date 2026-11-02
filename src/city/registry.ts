import { parseCity } from './loadCity.ts';

export interface CityListing {
  id: string;
  name: string;
}

// Bundled at build time, so listing cities makes no network request. The only place that discovers city ids.
const bundled: Record<string, unknown> = import.meta.glob('/data/*/city.json', { eager: true, import: 'default' });

/** Every city folder, sorted by name. `files` defaults to the bundled data folders; tests pass a fixture glob. */
export function listCities(files: Record<string, unknown> = bundled): CityListing[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const city = parseCity(raw);
      const folder = path.split('/').slice(-2, -1)[0];
      if (city.id !== folder) throw new Error(`city ${folder}: city_id ${city.id} does not match its folder`);
      return { id: city.id, name: city.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
