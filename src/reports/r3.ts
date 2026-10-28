import { matchAddress, type BlockInfo, type MatchIndex } from '../geo/matcher.ts';
import type { Citation, NamedLocation } from '../types.ts';
import type { FeatureCollection } from '../map/style.ts';

export interface BlockRank {
  blockId: string;
  /** For example "400 block of North Main Street". */
  label: string;
  count: number;
}

export interface Pin {
  id: string;
  name: string;
  count: number;
  lon: number;
  lat: number;
}

export interface Hotspots {
  ranked: BlockRank[];
  counts: Map<string, number>;
  pins: Pin[];
  /** Citations with no matched block; they appear in the unmatched list, not on the map. */
  unmatched: number;
}

type Segment = { properties: { segment_id: string }; geometry: { coordinates: [number, number][] } };

/** Midpoint of each segment's vertices, by segment (block) id. */
export function blockCentroids(segments: FeatureCollection): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const f of segments.features as Segment[]) {
    const pts = f.geometry.coordinates;
    if (pts.length === 0) continue;
    out.set(f.properties.segment_id, [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
  }
  return out;
}

/**
 * R3 block hotspots (RPT-2): citations per block, ranked, plus named locations as pins. A pin sits at the location's
 * latitude/longitude, or else at the block its first address matches; a location with neither has no pin.
 */
export function buildHotspots(
  citations: Citation[],
  blocks: BlockInfo[],
  namedLocations: NamedLocation[],
  index: MatchIndex,
  centroids: Map<string, [number, number]>,
): Hotspots {
  const counts = new Map<string, number>();
  const pinCounts = new Map<string, number>();
  let unmatched = 0;
  for (const c of citations) {
    if (c.blockId) counts.set(c.blockId, (counts.get(c.blockId) ?? 0) + 1);
    else unmatched++;
    if (c.namedLocationId) pinCounts.set(c.namedLocationId, (pinCounts.get(c.namedLocationId) ?? 0) + 1);
  }

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const ranked = [...counts]
    .map(([blockId, count]) => {
      const b = byId.get(blockId);
      return { blockId, label: b ? `${b.blockNumber ?? '?'} block of ${b.street}` : blockId, count };
    })
    .sort((a, b) => b.count - a.count || a.blockId.localeCompare(b.blockId));

  const pins: Pin[] = [];
  for (const loc of namedLocations) {
    const count = pinCounts.get(loc.id) ?? 0;
    let at: [number, number] | undefined = loc.lat !== undefined && loc.lon !== undefined ? [loc.lon, loc.lat] : undefined;
    if (!at && loc.addresses[0]) {
      const blockId = matchAddress(loc.addresses[0], index).blockId;
      at = blockId ? centroids.get(blockId) : undefined;
    }
    if (at) pins.push({ id: loc.id, name: loc.name, count, lon: at[0], lat: at[1] });
  }
  return { ranked, counts, pins, unmatched };
}

/** Segments that have citations, tagged with their count, for the map's hotspot layer. */
export function hotspotFeatures(segments: FeatureCollection, counts: Map<string, number>): FeatureCollection {
  const features = (segments.features as (Segment & { type: string; geometry: object })[])
    .filter((f) => counts.has(f.properties.segment_id))
    .map((f) => ({ ...f, properties: { segment_id: f.properties.segment_id, count: counts.get(f.properties.segment_id) } }));
  return { type: 'FeatureCollection', features };
}

export function pinFeatures(pins: Pin[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, count: p.count },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}
