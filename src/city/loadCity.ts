import type { CitySettings } from '../types.ts';

type CityFiles = Record<string, unknown>;

// Bundled at build time, so loading a city makes no network request.
const bundled: CityFiles = import.meta.glob('/data/*/city.json', { eager: true, import: 'default' });

function fail(id: string, msg: string): never {
  throw new Error(`city ${id}: ${msg}`);
}

function num(id: string, v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(id, `${field} must be a number`);
  return v;
}

function str(id: string, v: unknown, field: string): string {
  if (typeof v !== 'string' || v === '') fail(id, `${field} must be a non-empty string`);
  return v;
}

function point(id: string, v: any, field: string): { lat: number; lon: number } {
  return { lat: num(id, v?.lat, `${field}.lat`), lon: num(id, v?.lon, `${field}.lon`) };
}

export function parseCity(raw: any): CitySettings {
  const id = str('?', raw?.city_id, 'city_id');
  const timeZone = str(id, raw.time_zone, 'time_zone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    fail(id, `unknown time_zone ${timeZone}`);
  }
  const days = num(id, raw.payment_window_days, 'payment_window_days');
  if (!Number.isInteger(days) || days < 0) fail(id, 'payment_window_days must be a non-negative integer');

  let extent: CitySettings['extent'];
  if (Array.isArray(raw.extent?.bbox) && raw.extent.bbox.length === 4) {
    extent = { bbox: raw.extent.bbox.map((n: unknown) => num(id, n, 'extent.bbox')) as [number, number, number, number] };
  } else if (Array.isArray(raw.extent?.polygon) && raw.extent.polygon.length >= 3) {
    extent = { polygon: raw.extent.polygon.map((p: any) => [num(id, p?.[0], 'extent.polygon'), num(id, p?.[1], 'extent.polygon')]) };
  } else {
    fail(id, 'extent must have a 4-number bbox or a polygon of at least 3 points');
  }

  const zones = raw.exclusion_zones ?? [];
  if (!Array.isArray(zones)) fail(id, 'exclusion_zones must be an array');
  const city: CitySettings = {
    id,
    name: str(id, raw.name, 'name'),
    timeZone,
    paymentWindowDays: days,
    extent,
    exclusionZones: zones.map((z: any) => ({ ...point(id, z, 'exclusion_zones'), radiusM: num(id, z?.radius_m, 'exclusion_zones.radius_m') })),
    depot: point(id, raw.depot, 'depot'),
  };
  if (raw.hot_zone_weights !== undefined) {
    if (!Array.isArray(raw.hot_zone_weights)) fail(id, 'hot_zone_weights must be an array');
    city.hotZoneWeights = raw.hot_zone_weights.map((h: any) => ({ ...point(id, h, 'hot_zone_weights'), weight: num(id, h?.weight, 'hot_zone_weights.weight') }));
  }
  return city;
}

/** Loads `<folder>/<id>/city.json`. `files` defaults to the bundled data folders; tests pass a fixture glob. */
export function loadCity(id: string, files: CityFiles = bundled): CitySettings {
  const key = Object.keys(files).find((k) => k.endsWith(`/${id}/city.json`));
  if (!key) throw new Error(`city ${id}: no city.json found`);
  const city = parseCity(files[key]);
  if (city.id !== id) fail(id, `city_id ${city.id} does not match its folder`);
  return city;
}
