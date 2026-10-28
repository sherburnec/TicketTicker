import type { Citation, FineEntry, NamedLocation } from '../types.ts';
import { buildMatchIndex, matchAddress, type BlockInfo } from '../geo/matcher.ts';
import { parseCsv } from '../city/schedule.ts';
import { FLAG_UNMATCHED_ADDRESS, REQUIRED_FIELDS, validateRow } from './validate.ts';

/** What the importer needs from the city: the data matching and validation run against. */
export interface ImportCity {
  schedule: FineEntry[];
  blocks: BlockInfo[];
  namedLocations: NamedLocation[];
}

export interface RejectedRow {
  /** 1-based record number in the file; the header is record 1. */
  rowNumber: number;
  raw: string[];
  reason: string;
}

export interface UnmatchedAddress {
  rowNumber: number;
  citationId: string;
  address: string;
}

export interface ImportCounts {
  total: number;
  imported: number;
  rejected: number;
  unmatched: number;
}

export interface ImportResult {
  citations: Citation[];
  rejected: RejectedRow[];
  unmatched: UnmatchedAddress[];
  counts: ImportCounts;
}

const PROGRESS_EVERY = 5000;

/**
 * Reads citation CSV text, matches each address to a block or named location, and reports what it could not use.
 * Everything happens in memory on the calling thread; nothing is fetched or stored (FR-5, NFR-1).
 */
export function importCitations(csv: string, city: ImportCity, onProgress?: (done: number, total: number) => void): ImportResult {
  const [head, ...body] = parseCsv(csv);
  if (!head) throw new Error('The file is empty.');
  const header = head.map((h) => h.trim());
  const missing = REQUIRED_FIELDS.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new Error(`Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);

  const index = buildMatchIndex(city.blocks, city.namedLocations);
  const citations: Citation[] = [];
  const rejected: RejectedRow[] = [];
  const unmatched: UnmatchedAddress[] = [];
  const ctx = { schedule: city.schedule, seenIds: new Set<string>() };

  body.forEach((raw, i) => {
    const rowNumber = i + 2;
    if (raw.length !== header.length) {
      rejected.push({ rowNumber, raw, reason: `Expected ${header.length} cells, found ${raw.length}` });
    } else {
      const result = validateRow(Object.fromEntries(header.map((h, j) => [h, raw[j].trim()])), ctx);
      if (!result.ok) {
        rejected.push({ rowNumber, raw, reason: result.reason });
      } else {
        const citation = result.citation;
        const match = matchAddress(citation.address, index);
        citation.blockId = match.blockId;
        citation.namedLocationId = match.namedLocationId;
        if (match.blockId === undefined && match.namedLocationId === undefined) {
          citation.flags.push(FLAG_UNMATCHED_ADDRESS);
          unmatched.push({ rowNumber, citationId: citation.id, address: citation.address });
        }
        citations.push(citation);
      }
    }
    if (onProgress && (i + 1) % PROGRESS_EVERY === 0) onProgress(i + 1, body.length);
  });
  onProgress?.(body.length, body.length);

  return {
    citations,
    rejected,
    unmatched,
    counts: { total: body.length, imported: citations.length, rejected: rejected.length, unmatched: unmatched.length },
  };
}

export interface ImportRequest {
  csv: string;
  city: ImportCity;
}

export type ImportMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: ImportResult }
  | { type: 'error'; message: string };

/** Runs the import in a Web Worker so a large file does not freeze the page (NFR-6). */
export function importCitationsInWorker(csv: string, city: ImportCity, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/citationWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ImportMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') return onProgress?.(msg.done, msg.total);
      worker.terminate();
      if (msg.type === 'done') resolve(msg.result);
      else reject(new Error(msg.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The import worker failed.'));
    };
    worker.postMessage({ csv, city } satisfies ImportRequest);
  });
}
