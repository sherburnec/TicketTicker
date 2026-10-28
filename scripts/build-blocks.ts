// Build-time script (DR-9), never shipped or run in the browser.
//
//   node scripts/build-blocks.ts [city]      (city defaults to burbank)
//
// Downloads the city's address points from the LA County CAMS dataset, snaps each to the nearest street segment of the
// same street, and derives the hundred-block number. Reads data/<city>/segments.geojson (never writes it) and writes
// data/<city>/blocks.csv and blocks-report.md. Rows with source=manual in an existing blocks.csv are kept as they are.
// A block number is never guessed: fewer than 2 matching addresses, or addresses in different hundreds, leave it empty.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { streetKey } from '../src/geo/normalize.ts';

export { streetKey };

export interface Address {
  housenumber: number;
  street: string;
  lat: number;
  lon: number;
}

export interface Segment {
  segment_id: string;
  street: string;
  coordinates: number[][];
}

export interface BlockRow {
  segment_id: string;
  /** A non-negative multiple of 100, or null when not known. */
  block_number: number | null;
  low_address: number | null;
  high_address: number | null;
  /** cams: written by this script. manual: typed by hand, never overwritten by the script. */
  source: 'cams' | 'manual';
}

export const BLOCK_COLUMNS = ['segment_id', 'block_number', 'low_address', 'high_address', 'source'];

/** An address belongs to a segment only within this distance of its line. */
export const MAX_DISTANCE_M = 40;

/** A plain number, optionally with one unit letter ("1204A"). Ranges, lists, fractions, zero and text are refused. */
export function parseHouseNumber(raw: string): number | null {
  const m = /^\s*(\d+)\s?[A-Za-z]?\s*$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export const hundredOf = (n: number): number => Math.floor(n / 100) * 100;

/** The block number for the house numbers found on one segment, or null when it cannot be said for certain. */
export function blockNumberFor(numbers: number[]): number | null {
  if (numbers.length < 2) return null;
  const hundreds = new Set(numbers.map(hundredOf));
  return hundreds.size === 1 ? [...hundreds][0] : null;
}

const EARTH_M = 6371008.8;

/** Shortest distance in metres from a point to a polyline, on a local flat projection (fine at block scale). */
export function distanceToLineM(point: [number, number], line: number[][]): number {
  const k = Math.cos((point[1] * Math.PI) / 180);
  const toM = (c: number[]): [number, number] => [((c[0] - point[0]) * Math.PI * EARTH_M * k) / 180, ((c[1] - point[1]) * Math.PI * EARTH_M) / 180];
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toM(line[i]);
    const [bx, by] = toM(line[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Each address goes to the nearest segment of the same street within MAX_DISTANCE_M. Returns segment_id to house numbers. */
export function assignAddresses(addresses: Address[], segments: Segment[]): Map<string, number[]> {
  const byStreet = new Map<string, Segment[]>();
  for (const s of segments) {
    const key = streetKey(s.street);
    byStreet.set(key, [...(byStreet.get(key) ?? []), s]);
  }
  const found = new Map<string, number[]>();
  for (const a of addresses) {
    let bestId: string | null = null;
    let bestD = MAX_DISTANCE_M;
    for (const s of byStreet.get(streetKey(a.street)) ?? []) {
      const d = distanceToLineM([a.lon, a.lat], s.coordinates);
      if (d <= bestD) {
        bestD = d;
        bestId = s.segment_id;
      }
    }
    if (bestId !== null) found.set(bestId, [...(found.get(bestId) ?? []), a.housenumber]);
  }
  return found;
}

/** One row per segment, in the order given. */
export function summariseSegments(segmentIds: string[], found: Map<string, number[]>): BlockRow[] {
  return segmentIds.map((segment_id) => {
    const nums = found.get(segment_id) ?? [];
    return {
      segment_id,
      block_number: blockNumberFor(nums),
      low_address: nums.length ? Math.min(...nums) : null,
      high_address: nums.length ? Math.max(...nums) : null,
      source: 'cams',
    };
  });
}

/** Manual rows win and are kept as they are (even for a segment the new run no longer has); everything else is the new result. */
export function mergeBlockRows(existing: BlockRow[], fresh: BlockRow[]): BlockRow[] {
  const merged = new Map<string, BlockRow>(fresh.map((r) => [r.segment_id, r]));
  for (const r of existing) if (r.source === 'manual') merged.set(r.segment_id, r);
  return [...merged.values()].sort((a, b) => (a.segment_id < b.segment_id ? -1 : 1));
}

const num = (v: string | undefined): number | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : Number(t);
};

export function parseBlockRows(text: string): BlockRow[] {
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!head) return [];
  const header = head.split(',').map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  return lines.map((line) => {
    const cells = line.split(',');
    return {
      segment_id: (cells[at('segment_id')] ?? '').trim(),
      block_number: num(cells[at('block_number')]),
      low_address: num(cells[at('low_address')]),
      high_address: num(cells[at('high_address')]),
      source: (cells[at('source')] ?? '').trim() as BlockRow['source'],
    };
  });
}

export function serializeBlockRows(rows: BlockRow[]): string {
  const cell = (n: number | null) => (n === null ? '' : String(n));
  const lines = rows.map((r) => [r.segment_id, cell(r.block_number), cell(r.low_address), cell(r.high_address), r.source].join(','));
  return `${[BLOCK_COLUMNS.join(','), ...lines].join('\n')}\n`;
}

function reasonFor(r: BlockRow): string {
  if (r.low_address === null) return 'no address found';
  if (hundredOf(r.low_address) !== hundredOf(r.high_address!)) return `addresses ${r.low_address} to ${r.high_address} are in different hundreds`;
  return 'only 1 address found';
}

/** The hand-entry to-do list: every block without a number. */
export function renderReport(cityId: string, rows: BlockRow[], streetOf: Map<string, string>): string {
  const todo = rows.filter((r) => r.block_number === null);
  return [
    `# Block numbers needing hand entry: ${cityId}`,
    '',
    'Written by `scripts/build-blocks.ts`. Do not edit; fill the gaps in `blocks.csv` instead.',
    '',
    `- Blocks numbered: ${rows.length - todo.length} of ${rows.length}`,
    `- Blocks needing hand entry: ${todo.length}`,
    '',
    'To fill one, set `block_number` (a multiple of 100) and `source` to `manual` on its row in `blocks.csv`. Manual rows are kept when the script is re-run.',
    '',
    '| segment_id | street | reason |',
    '| --- | --- | --- |',
    ...todo.map((r) => `| ${r.segment_id} | ${streetOf.get(r.segment_id) ?? ''} | ${reasonFor(r)} |`),
    '',
  ].join('\n');
}

const CAMS_QUERY = 'https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/402/query';
const PAGE = 2000;

interface CamsFeature {
  attributes: { Number: string | null; FullName: string | null; StreetName: string | null };
  geometry?: { x: number; y: number };
}

/** All CAMS points whose legal city is `legalCity`, in WGS84, paged because the layer returns at most 2000 per request. */
async function download(legalCity: string): Promise<Address[]> {
  const out: Address[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: `LegalComm='${legalCity.replace(/'/g, "''")}'`,
      outFields: 'Number,FullName,StreetName',
      outSR: '4326',
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: 'json',
    });
    const res = await fetch(`${CAMS_QUERY}?${params}`);
    if (!res.ok) throw new Error(`CAMS answered ${res.status}`);
    const json = (await res.json()) as { features?: CamsFeature[]; exceededTransferLimit?: boolean; error?: { message: string } };
    if (json.error || !json.features) throw new Error(`CAMS error: ${json.error?.message ?? 'no features'}`);
    for (const f of json.features) {
      const housenumber = parseHouseNumber(f.attributes.Number ?? '');
      const street = f.attributes.FullName ?? f.attributes.StreetName;
      if (housenumber !== null && street && f.geometry) out.push({ housenumber, street, lat: f.geometry.y, lon: f.geometry.x });
    }
    console.log(`  ${offset + json.features.length} points read`);
    if (!json.exceededTransferLimit && json.features.length < PAGE) break;
  }
  return out;
}

async function main() {
  const cityId = process.argv[2] ?? 'burbank';
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'data', cityId);
  const blocksPath = resolve(dir, 'blocks.csv');
  const city = JSON.parse(readFileSync(resolve(dir, 'city.json'), 'utf8')) as { name: string };
  const legalCity = city.name.split(',')[0].trim();

  const geo = JSON.parse(readFileSync(resolve(dir, 'segments.geojson'), 'utf8')) as {
    features: { properties: { segment_id: string; street: string }; geometry: { coordinates: number[][] } }[];
  };
  const segments: Segment[] = geo.features.map((f) => ({ segment_id: f.properties.segment_id, street: f.properties.street, coordinates: f.geometry.coordinates }));

  console.log(`Querying CAMS for ${legalCity} ...`);
  const addresses = await download(legalCity);
  if (addresses.length === 0) throw new Error('CAMS returned no usable addresses; refusing to write an all-empty file.');

  const fresh = summariseSegments(segments.map((s) => s.segment_id), assignAddresses(addresses, segments));
  const existing = existsSync(blocksPath) ? parseBlockRows(readFileSync(blocksPath, 'utf8')) : [];
  const rows = mergeBlockRows(existing, fresh);

  writeFileSync(blocksPath, serializeBlockRows(rows));
  writeFileSync(resolve(dir, 'blocks-report.md'), renderReport(cityId, rows, new Map(segments.map((s) => [s.segment_id, s.street]))));

  const numbered = rows.filter((r) => r.block_number !== null).length;
  console.log(`${addresses.length} usable addresses. Wrote ${rows.length} rows (${existing.filter((r) => r.source === 'manual').length} manual kept).`);
  console.log(`Blocks numbered: ${numbered} of ${rows.length}. Blocks needing hand entry: ${rows.length - numbered} (see blocks-report.md).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
