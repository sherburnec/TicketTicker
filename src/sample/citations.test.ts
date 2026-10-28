import { describe, expect, it } from 'vitest';
import { generateCitationRows, generateCitations, CITATION_HEADERS, type CitationSource } from './citations.ts';
import { parseBlocks } from '../city/blocks.ts';
import { parseFineSchedule, parseNamedLocations } from '../city/schedule.ts';
import { loadCity } from '../city/loadCity.ts';
import { buildMatchIndex, matchAddress } from '../geo/matcher.ts';
import blocksCsv from '../../data/burbank/blocks.csv?raw';
import segments from '../../data/burbank/segments.geojson?raw';
import scheduleCsv from '../../data/burbank/fine-schedule.csv?raw';
import locationsCsv from '../../data/burbank/named-locations.csv?raw';

const source = (): CitationSource => ({
  city: loadCity('burbank'),
  schedule: parseFineSchedule(scheduleCsv),
  blocks: parseBlocks(blocksCsv, segments),
  namedLocations: parseNamedLocations(locationsCsv),
});

const END = '2026-09-30';
const DAY = 86400000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

describe('generateCitationRows', () => {
  const src = source();
  const rows = generateCitationRows({ seed: 1, endDate: END }, src);

  it('gives byte-identical output for the same seed', () => {
    expect(generateCitations({ seed: 1, endDate: END }, src)).toBe(generateCitations({ seed: 1, endDate: END }, src));
    expect(generateCitations({ seed: 2, endDate: END }, src)).not.toBe(generateCitations({ seed: 1, endDate: END }, src));
  });

  it('fills every field of section 8.1 and uses the header names verbatim', () => {
    const csv = generateCitations({ seed: 1, endDate: END }, src).split('\n');
    expect(csv[0]).toBe(CITATION_HEADERS.join(','));
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(r.officer).not.toBe('');
      expect(r.address).toMatch(/^\d+ /);
      expect(r.fineAmount).toBeGreaterThan(0);
    }
    expect(rows.some((r) => r.vehicleType && r.vehicleColor)).toBe(true);
    expect(new Set(rows.map((r) => r.result))).toEqual(new Set(['Paid', 'Unpaid', 'Reversed', 'Pending']));
  });

  it('uses only schedule codes, with the base amount as the fine', () => {
    const base = new Map(src.schedule.map((e) => [e.code, e.base]));
    for (const r of rows) expect(base.get(r.code)).toBe(r.fineAmount);
  });

  it('averages about 200 citations a day', () => {
    const days = daysBetween(rows[0].date, END) + 1;
    expect(days).toBe(31);
    expect(rows.length / days).toBeGreaterThan(190);
    expect(rows.length / days).toBeLessThan(210);
  });

  it('puts every address on a block, and some on the named locations', () => {
    const index = buildMatchIndex(src.blocks, src.namedLocations);
    for (const r of rows) expect(matchAddress(r.address, index).blockId).toBeDefined();
    const named = rows.filter((r) => matchAddress(r.address, index).namedLocationId !== undefined);
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named.map((r) => matchAddress(r.address, index).namedLocationId)).size).toBe(3);
  });

  it('keeps Pending inside the payment window only', () => {
    const pending = rows.filter((r) => r.result === 'Pending');
    expect(pending.length).toBeGreaterThan(0);
    for (const r of pending) expect(daysBetween(r.date, END)).toBeLessThanOrEqual(21);
  });

  it('keeps paid and reversed rows consistent', () => {
    for (const r of rows) {
      if (r.result === 'Paid') {
        expect(r.paidAmount).toBeDefined();
        expect(r.paidDate! >= r.date && r.paidDate! <= END).toBe(true);
      } else {
        expect(r.paidAmount).toBeUndefined();
        expect(r.paidDate).toBeUndefined();
      }
    }
  });
});

describe('outcome shares', () => {
  const src = source();
  const rows = generateCitationRows({ seed: 5, endDate: END, durationMonths: 12 }, src);

  it('stay within the configured variation each month, outside the pending window', () => {
    const byMonth = new Map<string, string[]>();
    for (const r of rows.filter((x) => x.result !== 'Pending' && daysBetween(x.date, END) > 21)) {
      byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r.result]);
    }
    expect(byMonth.size).toBeGreaterThanOrEqual(11);
    // 5 points of variation plus sampling noise for about 6,000 citations a month.
    for (const results of byMonth.values()) {
      const share = (x: string) => results.filter((r) => r === x).length / results.length;
      expect(Math.abs(share('Paid') - 0.7)).toBeLessThan(0.065);
      expect(Math.abs(share('Reversed') - 0.2)).toBeLessThan(0.065);
      expect(Math.abs(share('Unpaid') - 0.1)).toBeLessThan(0.065);
    }
  });

  it('pays about 25% of paid citations at the escalated amount', () => {
    const escalated = new Map(src.schedule.map((e) => [e.code, e.escalated]));
    const paid = rows.filter((r) => r.result === 'Paid' && daysBetween(r.date, END) > 21);
    const share = paid.filter((r) => r.paidAmount === escalated.get(r.code)).length / paid.length;
    expect(share).toBeGreaterThan(0.22);
    expect(share).toBeLessThan(0.28);
  });
});

describe('schedule changes', () => {
  it('are reflected when regenerating', () => {
    const src = source();
    const before = generateCitations({ seed: 1, endDate: END }, src);
    const edited = { ...src, schedule: parseFineSchedule(scheduleCsv + 'LOCAL-1,Local rule,40,60,,,50\n') };
    const after = generateCitationRows({ seed: 1, endDate: END }, edited);
    expect(after.some((r) => r.code === 'LOCAL-1' && r.fineAmount === 40)).toBe(true);
    expect(generateCitations({ seed: 1, endDate: END }, edited)).not.toBe(before);
  });

  it('honour a start date: a code is not issued before it begins', () => {
    const src = source();
    const schedule = parseFineSchedule(scheduleCsv + 'LATE-1,Late rule,40,60,2026-09-15,,200\n');
    const rows = generateCitationRows({ seed: 1, endDate: END }, { ...src, schedule });
    const late = rows.filter((r) => r.code === 'LATE-1');
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((r) => r.date >= '2026-09-15')).toBe(true);
  });
});
