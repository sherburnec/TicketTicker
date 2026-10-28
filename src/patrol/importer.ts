import { buildMatchIndex, matchAddress, type BlockInfo } from '../geo/matcher.ts';
import type { CitySettings, NamedLocation } from '../types.ts';
import { createAggregator, segmentCentroids, type PatrolAggregate, type UnmatchedStop } from './aggregate.ts';
import { PATROL_DEFAULTS } from './config.ts';
import { createExcluder, emptyExcluded, excludingSink, extentOrigin, type ExcludedCounts } from './extent.ts';
import { summarize, type PatrolSummary } from './summary.ts';
import { parseTimestamp, zoneClock } from './time.ts';
import { FORMAT_FIELDS, type ColumnMapping, type FieldKey, type PatrolFormat } from './formats.ts';

export interface PatrolRejected {
  /** 1-based record number in the file; the header is record 1. */
  rowNumber: number;
  /** Only the cells the importer reads, in `FORMAT_FIELDS` order. Other columns, driver included, are never kept (FR-39). */
  raw: string[];
  reason: string;
}

export type StopLocation = { lat: number; lon: number } | { address: string } | undefined;

/** A validated patrol event. It carries a vehicle id, a time and a place, and nothing about the driver (FR-39, DR-15). */
export type PatrolPoint =
  | { format: 'A'; vehicle: string; time: number; lat: number; lon: number; speed?: number }
  | { format: 'B'; vehicle: string; kind: 'start' | 'end'; time: number; location: StopLocation };

export interface PatrolCounts {
  read: number;
  imported: number;
  rejected: number;
  /** Same vehicle and time as an earlier point; ignored, first kept (DR-14). */
  duplicates: number;
  /** Format A points earlier than the vehicle's previous point; ignored so dwell can be computed in one pass. */
  outOfOrder: number;
}

export interface PatrolImportOptions {
  /** Epoch milliseconds for a timestamp cell, or undefined when it cannot be read (FR-33). */
  parseTime: (raw: string) => number | undefined;
}

const PROGRESS_EVERY = 20000;

/**
 * Lazily yields CSV records with the offset just after each one, so a large file is read in one pass without
 * building a row array (FR-30). Quoted cells, doubled quotes, CRLF or LF; blank lines are skipped.
 */
export function* csvRecords(text: string): Generator<[cells: string[], end: number]> {
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0].trim() !== '') yield [row, i + 1];
      row = [];
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.length > 1 || row[0].trim() !== '') yield [row, text.length];
  }
}

type Outcome = { points: PatrolPoint[] } | { reason: string };

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));

/** Latitude and longitude checks shared by both formats (DR-13). */
function coordinateProblem(lat: number, lon: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Latitude or longitude is not a number';
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'Latitude or longitude is out of range';
  if (lat === 0 && lon === 0) return 'Coordinates are (0,0), a GPS no-fix';
  return undefined;
}

const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

/** A Format B location cell: coordinates when it reads as a pair, otherwise address text (FR-37). */
function readLocation(cell: string): { location: StopLocation } | { reason: string } {
  const text = cell.trim();
  if (text === '') return { location: undefined };
  const pair = COORDINATE_PAIR.exec(text);
  if (!pair) return { location: { address: text } };
  const lat = Number(pair[1]);
  const lon = Number(pair[2]);
  const problem = coordinateProblem(lat, lon);
  return problem ? { reason: problem } : { location: { lat, lon } };
}

function validateA(get: (k: FieldKey) => string, opts: PatrolImportOptions): Outcome {
  const vehicle = get('vehicle').trim();
  if (vehicle === '') return { reason: 'Missing vehicle' };
  const time = opts.parseTime(get('time').trim());
  if (time === undefined) return { reason: 'Missing or unreadable time' };
  const lat = num(get('latitude'));
  const lon = num(get('longitude'));
  const problem = coordinateProblem(lat, lon);
  if (problem) return { reason: problem };
  const speed = num(get('speed'));
  return { points: [{ format: 'A', vehicle, time, lat, lon, ...(speed >= 0 ? { speed } : {}) }] };
}

function validateB(get: (k: FieldKey) => string, opts: PatrolImportOptions): Outcome {
  const vehicle = get('vehicle').trim();
  if (vehicle === '') return { reason: 'Missing vehicle' };
  const start = opts.parseTime(get('startTime').trim());
  const end = opts.parseTime(get('endTime').trim());
  if (start === undefined) return { reason: 'Missing or unreadable trip start time' };
  if (end === undefined) return { reason: 'Missing or unreadable trip end time' };
  if (end < start) return { reason: 'Trip end time is before the start time' };
  const from = readLocation(get('startLocation'));
  if ('reason' in from) return { reason: `Trip start: ${from.reason}` };
  const to = readLocation(get('endLocation'));
  if ('reason' in to) return { reason: `Trip end: ${to.reason}` };
  return {
    points: [
      { format: 'B', vehicle, kind: 'start', time: start, location: from.location },
      { format: 'B', vehicle, kind: 'end', time: end, location: to.location },
    ],
  };
}

/**
 * Reads patrol CSV text in one pass, validates each row against §8.4 and hands every accepted point to `onPoint`
 * (FR-30, FR-31, DR-13, DR-14). Rows are never collected: later stages consume points as they arrive, so no raw
 * points are retained (FR-38). Columns outside `columns` are never read, so driver data cannot leak (FR-39).
 */
export function readPatrol(
  csv: string,
  format: PatrolFormat,
  columns: ColumnMapping,
  opts: PatrolImportOptions,
  onPoint: (point: PatrolPoint) => void,
  onProgress?: (done: number, total: number) => void,
): { rejected: PatrolRejected[]; counts: PatrolCounts } {
  const specs = FORMAT_FIELDS[format];
  const missing = specs.filter((s) => s.required && columns[s.key] === undefined);
  if (missing.length > 0) throw new Error(`Missing required column${missing.length === 1 ? '' : 's'}: ${missing.map((s) => s.label).join(', ')}`);
  const width = Math.max(...Object.values(columns)) + 1;

  const rejected: PatrolRejected[] = [];
  const counts: PatrolCounts = { read: 0, imported: 0, rejected: 0, duplicates: 0, outOfOrder: 0 };
  const lastTime = new Map<string, number>();
  const seenStops = new Set<string>();
  const validate = format === 'A' ? validateA : validateB;

  let rowNumber = 0;
  let sinceProgress = 0;
  for (const [cells, end] of csvRecords(csv)) {
    if (++rowNumber === 1) continue;
    counts.read++;
    const get = (k: FieldKey) => (columns[k] === undefined ? '' : (cells[columns[k]!] ?? ''));
    const reject = (reason: string) => {
      counts.rejected++;
      rejected.push({ rowNumber, raw: specs.map((s) => get(s.key)), reason });
    };

    if (cells.length < width) reject(`Expected at least ${width} cells, found ${cells.length}`);
    else {
      const out = validate(get, opts);
      if ('reason' in out) reject(out.reason);
      else {
        let kept = 0;
        for (const p of out.points) {
          if (p.format === 'A') {
            const last = lastTime.get(p.vehicle);
            if (last !== undefined && p.time === last) counts.duplicates++;
            else if (last !== undefined && p.time < last) counts.outOfOrder++;
            else {
              lastTime.set(p.vehicle, p.time);
              onPoint(p);
              kept++;
            }
          } else {
            const key = `${p.vehicle}|${p.kind}|${p.time}`;
            if (seenStops.has(key)) counts.duplicates++;
            else {
              seenStops.add(key);
              onPoint(p);
              kept++;
            }
          }
        }
        if (kept > 0) counts.imported++;
      }
    }
    if (onProgress && ++sinceProgress >= PROGRESS_EVERY) {
      sinceProgress = 0;
      onProgress(end, csv.length);
    }
  }
  if (rowNumber === 0) throw new Error('The file is empty.');
  onProgress?.(csv.length, csv.length);
  return { rejected, counts };
}

/** The rejects file: record number, reason and the cells the importer read (FR-31). Driver columns are never included. */
export function patrolRejectsToCsv(format: PatrolFormat, rejected: PatrolRejected[]): string {
  const cell = (s: string | number) => {
    const t = String(s);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const line = (cells: (string | number)[]) => cells.map(cell).join(',');
  const head = line(['Row', 'Reason', ...FORMAT_FIELDS[format].map((s) => s.label)]);
  return [head, ...rejected.map((r) => line([r.rowNumber, r.reason, ...r.raw]))].join('\n') + '\n';
}

/** What the importer needs from the city: settings for extent, zones and zone, plus blocks and segments to place Format B addresses. */
export interface PatrolCity {
  settings: CitySettings;
  blocks: BlockInfo[];
  namedLocations: NamedLocation[];
  /** Street geometry, needed only to place Format B address stops. */
  segments?: { features: unknown[] };
}

export interface PatrolRequest {
  csv: string;
  format: PatrolFormat;
  columns: ColumnMapping;
  /** Zone for times without a UTC marker or offset (FR-33). */
  timeZone: string;
  city: PatrolCity;
}

export interface PatrolImportResult {
  aggregate: PatrolAggregate;
  summary: PatrolSummary;
  rejected: PatrolRejected[];
  excluded: ExcludedCounts;
  unmatched: UnmatchedStop[];
}

/**
 * The whole patrol import: validate, exclude points outside the extent or in zones, and aggregate (FR-30 to FR-38).
 * Only the aggregate survives; raw points are never kept, and driver columns are never read (FR-38, FR-39).
 */
export function importPatrol(req: PatrolRequest, onProgress?: (done: number, total: number) => void): PatrolImportResult {
  const parseClock = zoneClock(req.timeZone);
  const cityClock = zoneClock(req.city.settings.timeZone);
  const { settings } = req.city;
  const placeAddress = (() => {
    if (req.format !== 'B' || !req.city.segments) return undefined;
    const index = buildMatchIndex(req.city.blocks, req.city.namedLocations);
    const centroids = segmentCentroids(req.city.segments);
    return (address: string) => {
      const id = matchAddress(address, index).blockId;
      return id ? centroids.get(id) : undefined;
    };
  })();
  const aggregator = createAggregator({ format: req.format, clock: cityClock, origin: extentOrigin(settings), placeAddress });
  const excluded = emptyExcluded();
  const sink = excludingSink(createExcluder(settings, PATROL_DEFAULTS.depotRadiusMeters), excluded, (p) => aggregator.add(p));
  const { rejected, counts } = readPatrol(req.csv, req.format, req.columns, { parseTime: (raw) => parseTimestamp(raw, parseClock) }, sink, onProgress);
  const { aggregate, medianPingSeconds, unmatched } = aggregator.finish();
  const unmatchedStops = unmatched.reduce((n, u) => n + u.count, 0);
  return { aggregate, summary: summarize(aggregate, counts, excluded, medianPingSeconds, unmatchedStops, req.timeZone), rejected, excluded, unmatched };
}

export type PatrolMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: PatrolImportResult }
  | { type: 'error'; message: string };

/** Runs the import in a Web Worker so a large file does not freeze the page (FR-30, NFR-6). */
export function importPatrolInWorker(request: PatrolRequest, onProgress?: (done: number, total: number) => void): Promise<PatrolImportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/patrolWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PatrolMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') return onProgress?.(msg.done, msg.total);
      worker.terminate();
      if (msg.type === 'done') resolve(msg.result);
      else reject(new Error(msg.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The patrol import worker failed.'));
    };
    worker.postMessage(request satisfies PatrolRequest);
  });
}
