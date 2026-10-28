import type { StyleSpecification } from 'maplibre-gl';
import type { Bbox, CitySettings } from '../types.ts';

export type FeatureCollection = { type: 'FeatureCollection'; features: unknown[] };

/** Theme-dependent map colors; data layers keep one ramp that reads on both backgrounds. */
export const MAP_COLORS = {
  light: { background: '#eef1ef', streets: '#9aa6b0', pin: '#1f5f8b', pinStroke: '#ffffff' },
  dark: { background: '#0d1318', streets: '#43525f', pin: '#6bb1de', pinStroke: '#0d1318' },
} as const;

const EMPTY:FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Map style built only from the city's bundled street geometry (RPT-1, NFR-5).
 * Every source is inline GeoJSON; there are no tile, glyph or sprite URLs, so nothing is fetched.
 */
export function localStyle(segments: FeatureCollection): StyleSpecification {
  return {
    version: 8,
    sources: {
      streets: { type: 'geojson', data: segments as never },
      hotspots: { type: 'geojson', data: EMPTY as never },
      pins: { type: 'geojson', data: EMPTY as never },
      coverage: { type: 'geojson', data: EMPTY as never },
      patrol: { type: 'geojson', data: EMPTY as never },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': MAP_COLORS.light.background } },
      {
        id: 'streets',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_COLORS.light.streets, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 3] },
      },
      {
        id: 'hotspots',
        type: 'line',
        source: 'hotspots',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'count'], 1, '#f6c35b', 10, '#e8743b', 40, '#b3261e'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 7],
        },
      },
      {
        id: 'coverage',
        type: 'line',
        source: 'coverage',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1b8a7a', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 7] },
      },
      {
        id: 'patrol-heat',
        type: 'heatmap',
        source: 'patrol',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 1.6],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 30],
          'heatmap-opacity': 0.85,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,255,255,0)', 0.2, '#cfe3f5', 0.5, '#5b9bd5', 0.8, '#2c5aa0', 1, '#1b2a6b'],
        },
      },
      {
        id: 'pins',
        type: 'circle',
        source: 'pins',
        paint: { 'circle-radius': 6, 'circle-color': MAP_COLORS.light.pin, 'circle-stroke-color': MAP_COLORS.light.pinStroke, 'circle-stroke-width': 2 },
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
