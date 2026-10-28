import type { StyleSpecification } from 'maplibre-gl';
import type { Bbox, CitySettings } from '../types.ts';

export type FeatureCollection = { type: 'FeatureCollection'; features: unknown[] };

/**
 * Map style built only from the city's bundled street geometry (RPT-1, NFR-5).
 * Every source is inline GeoJSON; there are no tile, glyph or sprite URLs, so nothing is fetched.
 */
export function localStyle(segments: FeatureCollection): StyleSpecification {
  return {
    version: 8,
    sources: { streets: { type: 'geojson', data: segments as never } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f4f1ea' } },
      {
        id: 'streets',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8a8f98', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 3] },
      },
    ],
  };
}

export function cityBounds(city: CitySettings): Bbox {
  if ('bbox' in city.extent) return city.extent.bbox;
  const lons = city.extent.polygon.map((p) => p[0]);
  const lats = city.extent.polygon.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
