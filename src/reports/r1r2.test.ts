import { describe, expect, it } from 'vitest';
import type { Citation, FineEntry } from '../types.ts';
import { buildOverview } from './r1.ts';
import { buildTimeHeatmap, topWindows } from './r2.ts';

const schedule: FineEntry[] = [
  { code: 'CVC-22500(g)', name: 'Parking in a bus zone', base: 55, escalated: 65 },
  { code: 'BMC-7-3-101', name: 'Street sweeping', base: 70, escalated: 90 },
];
const ctx = { city: { paymentWindowDays: 21 }, schedule };
let n = 0;
const cit = (over: Partial<Citation>): Citation => ({
  id: `C${++n}`, date: '2025-03-03', time: '09:15', code: 'CVC-22500(g)', officer: '1', result: 'Paid',
  fineAmount: 55, paidAmount: 55, address: '1 A ST', flags: [], ...over,
});
// 2025-03-03 is a Monday, 03-04 Tuesday, 03-09 Sunday.
const data: Citation[] = [
  cit({}),
  cit({ time: '09:45' }),
  cit({ result: 'Unpaid', paidAmount: undefined }),
  cit({ date: '2025-03-04', time: '14:00', code: 'BMC-7-3-101', fineAmount: 70, paidAmount: 70 }),
  cit({ date: '2025-03-09', time: '09:00', result: 'Reversed', paidAmount: undefined }),
  cit({ date: '2025-03-09', time: '23:59', code: 'BMC-7-3-101', result: 'Pending', fineAmount: 70, paidAmount: undefined }),
];

describe('R1 overview', () => {
  const o = buildOverview(data, ctx, '2025-03-10');
  it('totals by result', () => {
    expect(o.total).toBe(6);
    expect(o.byResult).toEqual({ Paid: 3, Unpaid: 1, Pending: 1, Reversed: 1 });
  });
  it('totals by type with names, most citations first', () => {
    expect(o.byType.map((t) => [t.code, t.name, t.total])).toEqual([
      ['CVC-22500(g)', 'Parking in a bus zone', 4],
      ['BMC-7-3-101', 'Street sweeping', 2],
    ]);
    expect(o.byType[0].byResult).toEqual({ Paid: 2, Unpaid: 1, Pending: 0, Reversed: 1 });
    expect(o.byType[1].byResult).toEqual({ Paid: 1, Unpaid: 0, Pending: 1, Reversed: 0 });
  });
  it('carries Realized and Projected revenue', () => {
    expect(o.projection.realized).toEqual({ label: 'Realized', amount: 55 + 55 + 70 });
    expect(o.projection.projected.label).toBe('Projected');
  });
  it('handles no citations', () => {
    const e = buildOverview([], ctx, '2025-03-10');
    expect(e.total).toBe(0);
    expect(e.byType).toEqual([]);
  });
});

describe('R2 time heatmap', () => {
  const h = buildTimeHeatmap(data);
  it('counts by day of week and hour', () => {
    expect(h.counts[1][9]).toBe(3); // Monday 09:xx
    expect(h.counts[2][14]).toBe(1); // Tuesday 14:xx
    expect(h.counts[0][9]).toBe(1); // Sunday 09:00
    expect(h.counts[0][23]).toBe(1); // Sunday 23:59
    expect(h.counts.flat().reduce((a, b) => a + b, 0)).toBe(6);
    expect(h.total).toBe(6);
    expect(h.max).toBe(3);
  });
  it('has 7 days of 24 hours', () => {
    expect(h.counts).toHaveLength(7);
    expect(h.counts.every((d) => d.length === 24)).toBe(true);
  });
  it('lists top windows, ties by day then hour', () => {
    expect(topWindows(h, 3)).toEqual([
      { day: 1, hour: 9, count: 3 },
      { day: 0, hour: 9, count: 1 },
      { day: 0, hour: 23, count: 1 },
    ]);
  });
  it('is empty for no citations', () => {
    expect(buildTimeHeatmap([])).toMatchObject({ max: 0, total: 0 });
  });
});
