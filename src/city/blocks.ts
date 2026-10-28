import type { BlockInfo } from '../geo/matcher.ts';
import { parseCsv } from './schedule.ts';

/** Joins `blocks.csv` to the street names in `segments.geojson`. Blocks without a number are kept with a null number. */
export function parseBlocks(blocksCsv: string, segmentsGeojson: string): BlockInfo[] {
  const streets = new Map<string, string>();
  const geo = JSON.parse(segmentsGeojson) as { features: { properties: { segment_id: string; street: string } }[] };
  for (const f of geo.features) streets.set(f.properties.segment_id, f.properties.street);

  const [head, ...rows] = parseCsv(blocksCsv);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`blocks.csv: missing column ${name}`);
    return i;
  };
  const [id, num, low, high] = ['segment_id', 'block_number', 'low_address', 'high_address'].map(col);
  const int = (s: string) => (s.trim() === '' ? null : Number(s));
  return rows.map((r) => ({
    id: r[id],
    street: streets.get(r[id]) ?? '',
    blockNumber: int(r[num]),
    lowAddress: int(r[low]),
    highAddress: int(r[high]),
  }));
}
