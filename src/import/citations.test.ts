import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { importCitations } from './citations.ts';
import { loadCitySource } from '../ui/sourcePanel.ts';
import { generateCitations, CITATION_HEADERS } from '../sample/citations.ts';

const source = loadCitySource('burbank');
const HEAD = CITATION_HEADERS.join(',');

afterEach(() => vi.unstubAllGlobals());

describe('importCitations', () => {
  it('makes no fetch or XHR request while importing', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network')));
    const xhrSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    vi.stubGlobal('WebSocket', xhrSpy);
    vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: xhrSpy });

    const result = importCitations(generateCitations({ seed: 3 }, source), source);

    expect(result.counts.imported).toBeGreaterThan(1000);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('has no network calls in the importer or worker source', () => {
    for (const file of ['src/import/citations.ts', 'src/workers/citationWorker.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
    }
  });

  it('parses a sample and matches every address', () => {
    const csv = generateCitations({ seed: 3 }, source);
    const result = importCitations(csv, source);
    expect(result.counts.total).toBe(csv.trimEnd().split('\n').length - 1);
    expect(result.counts).toMatchObject({ rejected: 0, unmatched: 0, imported: result.counts.total });
    expect(result.citations.every((c) => c.blockId !== undefined || c.namedLocationId !== undefined)).toBe(true);
  });

  it('lists addresses that match no block', () => {
    const csv = `${HEAD}\nC1,2026-01-05,09:30,CVC-22500(g),101,Unpaid,55,,,1 Nowhere Pl,,\n`;
    const result = importCitations(csv, source);
    expect(result.unmatched).toEqual([{ rowNumber: 2, citationId: 'C1', address: '1 Nowhere Pl' }]);
    expect(result.citations).toHaveLength(1);
  });

  it('rejects a row with the wrong number of cells', () => {
    const csv = `${HEAD}\nC1,2026-01-05\n`;
    const result = importCitations(csv, source);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ rowNumber: 2, raw: ['C1', '2026-01-05'] });
    expect(result.counts).toEqual({ total: 1, imported: 0, rejected: 1, unmatched: 0 });
  });

  it('throws on a missing required column or an empty file', () => {
    expect(() => importCitations('Citation ID,Date\nC1,2026-01-01\n', source)).toThrow(/Missing required columns: Time/);
    expect(() => importCitations('', source)).toThrow('empty');
  });

  it('reports progress ending at the total', () => {
    const calls: [number, number][] = [];
    const csv = generateCitations({ seed: 3 }, source);
    importCitations(csv, source, (d, t) => calls.push([d, t]));
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.at(-1)![0]).toBe(calls.at(-1)![1]);
  });
});
