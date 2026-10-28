import { parseCsv } from '../city/schedule.ts';

export type PatrolFormat = 'A' | 'B';

export type FieldKey =
  | 'time' | 'latitude' | 'longitude' | 'vehicle' | 'speed'
  | 'startTime' | 'startLocation' | 'endTime' | 'endLocation';

export interface FieldSpec {
  key: FieldKey;
  label: string;
  required: boolean;
  /** Accepted header aliases, compared after normalizing case, spaces and punctuation (§8.4). */
  aliases: string[];
}

/**
 * The fields each format reads. Heading, address, distance and driver columns are deliberately absent: they are
 * ignored, and driver data is never read (FR-39, DR-15).
 */
export const FORMAT_FIELDS: Record<PatrolFormat, FieldSpec[]> = {
  A: [
    { key: 'time', label: 'Time', required: true, aliases: ['time', 'timestamp', 'happenedAtTime'] },
    { key: 'latitude', label: 'Latitude', required: true, aliases: ['latitude', 'lat'] },
    { key: 'longitude', label: 'Longitude', required: true, aliases: ['longitude', 'lon', 'lng'] },
    { key: 'vehicle', label: 'Vehicle', required: true, aliases: ['vehicle', 'vehicle name', 'vehicle id', 'asset'] },
    { key: 'speed', label: 'Speed', required: false, aliases: ['speedMilesPerHour', 'speed'] },
  ],
  B: [
    { key: 'startTime', label: 'Trip start time', required: true, aliases: ['trip start time', 'start time'] },
    { key: 'startLocation', label: 'Trip start location', required: true, aliases: ['trip start location', 'start location'] },
    { key: 'endTime', label: 'Trip end time', required: true, aliases: ['trip end time', 'end time'] },
    { key: 'endLocation', label: 'Trip end location', required: true, aliases: ['trip end location', 'end location'] },
    { key: 'vehicle', label: 'Asset / Vehicle', required: true, aliases: ['asset', 'vehicle', 'vehicle name', 'vehicle id'] },
  ],
};

/** Column index in the file for each field the importer reads. */
export type ColumnMapping = Partial<Record<FieldKey, number>>;

export interface Detection {
  format: PatrolFormat;
  mapping: ColumnMapping;
  /** Required fields with no recognized column. Empty means the format was detected and no mapping is needed. */
  missing: FieldSpec[];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Header cells of the first row only, so a large file is never parsed twice. */
export function readHeader(csv: string): string[] {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const end = text.search(/\r?\n/);
  return (parseCsv(end < 0 ? text : text.slice(0, end))[0] ?? []).map((h) => h.trim());
}

function resolve(headers: string[], format: PatrolFormat): Detection {
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const missing: FieldSpec[] = [];
  for (const spec of FORMAT_FIELDS[format]) {
    const i = normalized.findIndex((h, idx) => !used.has(idx) && spec.aliases.some((a) => norm(a) === h));
    if (i >= 0) {
      mapping[spec.key] = i;
      used.add(i);
    } else if (spec.required) missing.push(spec);
  }
  return { format, mapping, missing };
}

/**
 * Detects the format from the header row (FR-29). Format B wins when all its trip columns are present, then
 * Format A. Otherwise the closer format is returned with its missing fields, so the column mapper opens
 * pre-filled with whatever was recognized (FR-35).
 */
export function detectFormat(headers: string[]): Detection {
  const b = resolve(headers, 'B');
  if (b.missing.length === 0) return b;
  const a = resolve(headers, 'A');
  if (a.missing.length === 0) return a;
  return b.missing.length < a.missing.length ? b : a;
}

/** Re-resolves a format chosen by the user, keeping any recognized columns. */
export function detectAs(headers: string[], format: PatrolFormat): Detection {
  return resolve(headers, format);
}
