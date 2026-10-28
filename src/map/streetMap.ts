import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CitySettings } from '../types.ts';
import { cityBounds, localStyle, MAP_COLORS, type FeatureCollection } from './style.ts';

// The worker ships as its own file in this MapLibre version; bundle it so it is served from this site.
setWorkerUrl(workerUrl);

/** Mounts the local street map in `el`, fitted to the city extent. */
export function mountStreetMap(el: HTMLElement, city: CitySettings, segments: FeatureCollection): MapLibreMap {
  return new MapLibreMap({
    container: el,
    style: localStyle(segments),
    bounds: cityBounds(city),
    fitBoundsOptions: { padding: 20 },
    attributionControl: false,
  });
}

/** Recolors the base layers for the light or dark theme; data layers are untouched. Safe to call before the style loads. */
export function applyMapTheme(map: MapLibreMap, theme: 'light' | 'dark'): void {
  const apply = () => {
    const c = MAP_COLORS[theme];
    map.setPaintProperty('background', 'background-color', c.background);
    map.setPaintProperty('streets', 'line-color', c.streets);
    map.setPaintProperty('pins', 'circle-color', c.pin);
    map.setPaintProperty('pins', 'circle-stroke-color', c.pinStroke);
  };
  if (map.isStyleLoaded()) apply();
  else map.once('load', apply);
}
