import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from './style.ts';

/** Replaces the hotspot lines and named-location pins on a map built from `localStyle`. */
export function setHotspotData(map: MapLibreMap, hotspots: FeatureCollection, pins: FeatureCollection): void {
  // The style's sources are not available until the map has loaded.
  if (!map.getSource('hotspots')) {
    map.once('load', () => setHotspotData(map, hotspots, pins));
    return;
  }
  (map.getSource('hotspots') as GeoJSONSource).setData(hotspots as never);
  (map.getSource('pins') as GeoJSONSource).setData(pins as never);
}

/** Replaces the R5 coverage footprint lines on a map built from `localStyle`. */
export function setCoverageData(map: MapLibreMap, coverage: FeatureCollection): void {
  if (!map.getSource('coverage')) {
    map.once('load', () => setCoverageData(map, coverage));
    return;
  }
  (map.getSource('coverage') as GeoJSONSource).setData(coverage as never);
}
