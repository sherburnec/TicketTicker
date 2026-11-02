// Build-time script, never shipped or run in the browser.
//
//   node scripts/build-segments.ts <city> [--force]
//
// Reads data/<city>/city.json for the extent, fetches named drivable streets from OpenStreetMap (Overpass, one request),
// splits them at intersections with other streets and writes data/<city>/segments.geojson in the same shape as Burbank's:
// segment_id = <city>-<osm node>-<osm node>, street, from_street, to_street, city_id. Data is © OpenStreetMap contributors,
// ODbL 1.0 (see data/<city>/SOURCES.md). Never overwrites data/burbank/segments.geojson; replacing another city's file needs --force.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
}

export type Extent = { bbox: [number, number, number, number] } | { polygon: [number, number][] };

export interface SegmentFeature {
  type: 'Feature';
  properties: { segment_id: string; street: string; from_street: string; to_street: string; city_id: string };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

/** Roads a car can park on. Service roads (driveways, aisles) and ramps are left out. */
export const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']);

export function insideExtent(extent: Extent, lon: number, lat: number): boolean {
  if ('bbox' in extent) {
    const [w, s, e, n] = extent.bbox;
    return lon >= w && lon <= e && lat >= s && lat <= n;
  }
  const p = extent.polygon;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function extentBounds(extent: Extent): [number, number, number, number] {
  if ('bbox' in extent) return extent.bbox;
  const xs = extent.polygon.map((p) => p[0]);
  const ys = extent.polygon.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

interface Run {
  name: string;
  nodes: number[];
  coords: [number, number][];
}

const reversed = (r: Run): Run => ({ ...r, nodes: [...r.nodes].reverse(), coords: [...r.coords].reverse() });

/** The parts of a way that lie inside the extent, each at least two nodes long. */
export function clipRuns(way: OsmWay, extent: Extent): Run[] {
  const name = way.tags.name;
  const runs: Run[] = [];
  let cur: Run | undefined;
  way.nodes.forEach((node, i) => {
    const g = way.geometry[i];
    if (g && insideExtent(extent, g.lon, g.lat)) {
      cur ??= { name, nodes: [], coords: [] };
      cur.nodes.push(node);
      cur.coords.push([g.lon, g.lat]);
    } else if (cur) {
      runs.push(cur);
      cur = undefined;
    }
  });
  if (cur) runs.push(cur);
  return runs.filter((r) => r.nodes.length >= 2);
}

const round = (n: number) => Math.round(n * 1e7) / 1e7;

/** Splits named drivable ways at intersections with differently named streets, and joins pieces of one street that meet end to end. */
export function buildSegments(ways: OsmWay[], cityId: string, extent: Extent): SegmentFeature[] {
  const runs = ways
    .filter((w) => w.tags.name && DRIVABLE.has(w.tags.highway))
    .sort((a, b) => a.id - b.id)
    .flatMap((w) => clipRuns(w, extent));

  const namesAt = new Map<number, Set<string>>();
  for (const r of runs) for (const n of r.nodes) namesAt.set(n, (namesAt.get(n) ?? new Set()).add(r.name));
  const crossing = (n: number) => (namesAt.get(n)?.size ?? 0) > 1;

  let pieces: Run[] = [];
  for (const r of runs) {
    let start = 0;
    for (let i = 1; i < r.nodes.length; i++) {
      if (i === r.nodes.length - 1 || crossing(r.nodes[i])) {
        pieces.push({ name: r.name, nodes: r.nodes.slice(start, i + 1), coords: r.coords.slice(start, i + 1) });
        start = i;
      }
    }
  }

  // Join two pieces of the same street that meet at a node where no other street meets.
  for (let changed = true; changed; ) {
    changed = false;
    const ends = new Map<number, Run[]>();
    for (const p of pieces) {
      const a = p.nodes[0];
      const b = p.nodes[p.nodes.length - 1];
      if (a !== b) for (const n of [a, b]) ends.set(n, [...(ends.get(n) ?? []), p]);
    }
    for (const [n, ps] of ends) {
      if (ps.length !== 2 || ps[0] === ps[1] || crossing(n) || ps[0].name !== ps[1].name) continue;
      const [p, q] = ps;
      const head = p.nodes[p.nodes.length - 1] === n ? p : reversed(p);
      const tail = q.nodes[0] === n ? q : reversed(q);
      pieces = pieces.filter((x) => x !== p && x !== q);
      pieces.push({ name: p.name, nodes: [...head.nodes, ...tail.nodes.slice(1)], coords: [...head.coords, ...tail.coords.slice(1)] });
      changed = true;
      break;
    }
  }

  const otherStreet = (node: number, own: string) => [...(namesAt.get(node) ?? [])].filter((x) => x !== own).sort()[0] ?? '';
  const features = pieces.map((p): SegmentFeature => {
    const a = p.nodes[0];
    const b = p.nodes[p.nodes.length - 1];
    return {
      type: 'Feature',
      properties: { segment_id: `${cityId}-${a}-${b}`, street: p.name, from_street: otherStreet(a, p.name), to_street: otherStreet(b, p.name), city_id: cityId },
      geometry: { type: 'LineString', coordinates: p.coords.map(([x, y]) => [round(x), round(y)]) },
    };
  });
  const order = (f: SegmentFeature) => `${f.properties.segment_id}|${f.properties.street}`;
  features.sort((x, y) => (order(x) < order(y) ? -1 : order(x) > order(y) ? 1 : 0));
  // Two segments between the same pair of nodes (a loop, parallel carriageways) keep unique ids with a numeric suffix.
  const used = new Map<string, number>();
  for (const f of features) {
    const id = f.properties.segment_id;
    const n = (used.get(id) ?? 0) + 1;
    used.set(id, n);
    if (n > 1) f.properties.segment_id = `${id}-${n}`;
  }
  return features;
}

/** Burbank's file is never touched; another city's needs --force. */
export function assertWritable(cityId: string, exists: boolean, force: boolean): void {
  if (cityId === 'burbank') throw new Error('Refusing to overwrite data/burbank/segments.geojson.');
  if (exists && !force) throw new Error(`data/${cityId}/segments.geojson exists; pass --force to replace it.`);
}

export function serialize(features: SegmentFeature[]): string {
  return `{"type":"FeatureCollection","features":[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'CitationInsights-build-script/0.1 (one-off build step; see repository)';

async function download(extent: Extent): Promise<OsmWay[]> {
  const [w, s, e, n] = extentBounds(extent);
  const kinds = [...DRIVABLE].join('|');
  const query = `[out:json][timeout:120];way["highway"~"^(${kinds})$"]["name"](${s},${w},${n},${e});out geom;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  const json = (await res.json()) as { elements?: (OsmWay & { type: string })[] };
  if (!json.elements) throw new Error('Overpass returned no elements');
  return json.elements.filter((x) => x.type === 'way' && x.geometry && x.nodes);
}

async function main() {
  const [cityId, flag] = process.argv.slice(2);
  if (!cityId) throw new Error('usage: node scripts/build-segments.ts <city> [--force]');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'data', cityId);
  const out = resolve(dir, 'segments.geojson');
  assertWritable(cityId, existsSync(out), flag === '--force');
  const city = JSON.parse(readFileSync(resolve(dir, 'city.json'), 'utf8')) as { extent: { bbox?: [number, number, number, number]; polygon?: [number, number][] } };
  const extent: Extent = city.extent.bbox ? { bbox: city.extent.bbox } : { polygon: city.extent.polygon! };

  console.log(`Querying OpenStreetMap for ${cityId} ...`);
  const ways = await download(extent);
  const features = buildSegments(ways, cityId, extent);
  if (features.length === 0) throw new Error('No segments built; refusing to write an empty file.');
  writeFileSync(out, serialize(features));
  const streets = new Set(features.map((f) => f.properties.street));
  console.log(`${ways.length} ways -> ${features.length} segments on ${streets.size} streets. Wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
