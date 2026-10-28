import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CitySettings } from '../types.ts';
import { cityBounds, localStyle, type FeatureCollection } from './style.ts';

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
