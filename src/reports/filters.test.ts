import { describe, expect, it } from 'vitest';
import type { Citation } from '../types.ts';
import { applyFilters, dayOfWeek } from './filters.ts';

function cit(id: string, over: Partial<Citation> = {}): Citation {
  return {
    id,
    date: '2025-03-03', // Monday
    time: '09:15',
    code: 'CVC-22500(g)',
    officer: '101',
    result: 'Paid',
    fineAmount: 55,
    address: '100 N Main St',
    blockId: 'b1',
    flags: [],
    ...over,
  };
}

const data: Citation[] = [
  cit('a'),
  cit('b', { date: '2025-03-04', time: '14:00', code: 'BMC-7-3-101', result: 'Unpaid', blockId: 'b2' }),
  cit('c', { date: '2025-03-09', time: '09:59', result: 'Reversed', namedLocationId: 'loc1' }),
  cit('d', { date: '2025-03-10', time: '23:00', code: 'CVC-22502', blockId: undefined }),
];
const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(data, f).map((c) => c.id);

describe('applyFilters', () => {
  it('returns everything for an empty filter, including empty lists', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ hours: [], codes: [] })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('filters by inclusive date range', () => {
    expect(ids({ dateFrom: '2025-03-04', dateTo: '2025-03-09' })).toEqual(['b', 'c']);
    expect(ids({ dateFrom: '2025-03-10' })).toEqual(['d']);
    expect(ids({ dateTo: '2025-03-03' })).toEqual(['a']);
  });
  it('filters by day of week', () => {
    expect(dayOfWeek('2025-03-09')).toBe(0);
    expect(ids({ daysOfWeek: [0] })).toEqual(['c']);
    expect(ids({ daysOfWeek: [1, 2] })).toEqual(['a', 'b', 'd']);
  });
  it('filters by hour', () => {
    expect(ids({ hours: [9] })).toEqual(['a', 'c']);
    expect(ids({ hours: [14, 23] })).toEqual(['b', 'd']);
  });
  it('filters by code and by code source', () => {
    expect(ids({ codes: ['CVC-22502'] })).toEqual(['d']);
    expect(ids({ codeSources: ['BMC'] })).toEqual(['b']);
    expect(ids({ codeSources: ['CVC'] })).toEqual(['a', 'c', 'd']);
  });
  it('filters by result', () => {
    expect(ids({ results: ['Unpaid', 'Reversed'] })).toEqual(['b', 'c']);
  });
  it('filters by block; unmatched citations never match a block filter', () => {
    expect(ids({ blockIds: ['b1'] })).toEqual(['a', 'c']);
    expect(ids({ blockIds: ['b1', 'b2'] })).toEqual(['a', 'b', 'c']);
  });
  it('filters by named location', () => {
    expect(ids({ namedLocationIds: ['loc1'] })).toEqual(['c']);
  });
  it('combines filters with AND', () => {
    expect(ids({ hours: [9], results: ['Paid'], blockIds: ['b1'] })).toEqual(['a']);
    expect(ids({ hours: [9], codeSources: ['BMC'] })).toEqual([]);
  });
});
