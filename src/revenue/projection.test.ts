import { describe, expect, it } from 'vitest';
import type { Citation, FineEntry } from '../types.ts';
import { project } from './projection.ts';

const ctx = {
  city: { paymentWindowDays: 21 },
  schedule: [{ code: 'BMC-1', name: 'A', base: 50, escalated: 100 }] as FineEntry[],
};

let n = 0;
function cite(date: string, result: Citation['result'], extra: Partial<Citation> = {}): Citation {
  return { id: `C${++n}`, date, time: '10:00', code: 'BMC-1', officer: '1001', result, fineAmount: 50, address: '1 A ST', flags: [], ...extra };
}
const many = (count: number, date: string, result: Citation['result'], extra: Partial<Citation> = {}) => Array.from({ length: count }, () => cite(date, result, extra));

// Threshold 4 for the fixture. Two qualifying months:
//   July: 3 Paid (50, 50, 100 escalated) + 1 Unpaid(settled) = 4 settled, rate 0.75
//   Aug:  1 Paid + 3 Unpaid (past window as of 2026-09-30) = 4 settled, rate 0.25
//   Sep:  2 Unpaid in-window, 1 Pending, 1 Paid (50); none settled
// Realized = 50 + 50 + 100 + 50 + 50 = 300. Reversed citations add nothing.
const fixture: Citation[] = [
  cite('2026-07-01', 'Paid', { paidAmount: 50 }),
  cite('2026-07-02', 'Paid'), // no Paid amount: Fine amount counted (DR-4)
  cite('2026-07-03', 'Paid', { paidAmount: 100 }),
  cite('2026-07-04', 'Unpaid'),
  cite('2026-08-01', 'Paid', { paidAmount: 50 }),
  ...many(3, '2026-08-02', 'Unpaid'),
  cite('2026-09-25', 'Unpaid'),
  cite('2026-09-26', 'Unpaid'),
  cite('2026-09-27', 'Pending'),
  cite('2026-09-28', 'Paid', { paidAmount: 50 }),
];
const asOf = '2026-09-30';

describe('project', () => {
  const p = project(fixture, ctx, asOf, {}, 4);

  it('sums Realized from Paid amounts, using the Fine amount when missing', () => {
    expect(p.realized).toEqual({ label: 'Realized', amount: 50 + 50 + 100 + 50 + 50 });
  });

  it('shows Pending apart as a count and amount at stake', () => {
    expect(p.pending).toEqual({ count: 1, amount: 50 });
  });

  it('computes the pooled rates and the expected amount', () => {
    // Settled: 4 Paid... July 3 Paid + 1 Unpaid, Aug 1 Paid + 3 Unpaid = 4 Paid / 8 settled.
    expect(p.rates.collection.computed).toBeCloseTo(4 / 8, 10);
    // Escalation: 1 of 5 Paid at the escalated amount (July 3rd).
    expect(p.rates.escalation.computed).toBeCloseTo(1 / 5, 10);
    // Outstanding Unpaid: 4 past the window at 100 each, 2 in-window at 50*0.8 + 100*0.2 = 60.
    expect(p.outstanding).toEqual({ count: 6, expected: 4 * 100 + 2 * 60 });
  });

  it('projects average, low and high from pooled, lowest and highest monthly rates', () => {
    expect(p.months.map((m) => [m.month, m.settled, m.rate, m.qualifies])).toEqual([
      ['2026-07', 4, 0.75, true],
      ['2026-08', 4, 0.25, true],
      ['2026-09', 0, null, false],
    ]);
    expect(p.projected.label).toBe('Projected');
    expect(p.projected.avg).toBeCloseTo(520 * 0.5, 10);
    expect(p.projected.low).toBeCloseTo(520 * 0.25, 10);
    expect(p.projected.high).toBeCloseTo(520 * 0.75, 10);
    expect(p.projected.rangeNotice).toBeUndefined();
  });

  it('excludes months under the threshold from low and high and hides the range under two qualifying months', () => {
    const q = project(fixture, ctx, asOf, {}, 5);
    expect(q.months.every((m) => !m.qualifies)).toBe(true);
    expect(q.projected.low).toBeNull();
    expect(q.projected.high).toBeNull();
    expect(q.projected.rangeNotice).toMatch(/fewer than two months/);
    expect(q.projected.avg).toBeCloseTo(520 * 0.5, 10);
  });

  it('warns when settled citations are under the threshold', () => {
    expect(project(fixture, ctx, asOf, {}, 8).lowCountWarning).toBe(false);
    expect(project(fixture, ctx, asOf, {}, 9).lowCountWarning).toBe(true);
  });

  it('recomputes the average from a manual collection rate and hides the range', () => {
    const o = project(fixture, ctx, asOf, { collection: 0.9 }, 4);
    expect(o.projected.avg).toBeCloseTo(520 * 0.9, 10);
    expect(o.projected.low).toBeNull();
    expect(o.rates.collection.status).toBe('Manually set');
  });

  it('uses a manual escalation rate in the expected amount of in-window Unpaid citations', () => {
    const o = project(fixture, ctx, asOf, { escalation: 0 }, 4);
    expect(o.outstanding.expected).toBe(4 * 100 + 2 * 50);
  });

  it('excludes Reversed citations from revenue and projections', () => {
    const r = project([...fixture, ...many(5, '2026-08-03', 'Reversed')], ctx, asOf, {}, 4);
    expect(r.realized.amount).toBe(300);
    expect(r.outstanding.expected).toBe(520);
  });
});
