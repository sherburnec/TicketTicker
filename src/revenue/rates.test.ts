import { describe, expect, it } from 'vitest';
import type { Citation, FineEntry } from '../types.ts';
import { computeRates, paidAtEscalated } from './rates.ts';

const ctx = {
  city: { paymentWindowDays: 21 },
  schedule: [{ code: 'BMC-1', name: 'A', base: 50, escalated: 100 }] as FineEntry[],
};
const asOf = '2026-09-30';

function cite(n: number, date: string, result: Citation['result'], extra: Partial<Citation> = {}): Citation {
  return { id: `C${n}`, date, time: '10:00', code: 'BMC-1', officer: '1001', result, fineAmount: 50, address: '1 A ST', flags: [], ...extra };
}

// Hand-computed: settled = 6 Paid + 2 Unpaid + 1 Reversed = 9; Pending, and the two citations
// inside the 21-day window (#11, #12), are not settled. All Paid = 7 (#1-6 and #12), 2 of them escalated.
const fixture: Citation[] = [
  cite(1, '2026-08-01', 'Paid', { paidAmount: 50, paidDate: '2026-08-05' }),
  cite(2, '2026-08-02', 'Paid', { paidAmount: 100, paidDate: '2026-08-30' }),
  cite(3, '2026-08-03', 'Paid', { flags: ['paid-amount-missing'] }),
  cite(4, '2026-08-04', 'Paid', { paidAmount: 75, paidDate: '2026-08-30' }), // neither amount, 26 days: escalated
  cite(5, '2026-08-05', 'Paid', { paidAmount: 75, paidDate: '2026-08-10' }), // neither amount, 5 days: not
  cite(6, '2026-08-06', 'Paid', { paidAmount: 75 }), // neither amount, no date: not
  cite(7, '2026-08-07', 'Unpaid'),
  cite(8, '2026-08-08', 'Unpaid'),
  cite(9, '2026-08-09', 'Reversed'),
  cite(10, '2026-09-25', 'Pending'),
  cite(11, '2026-09-20', 'Unpaid'),
  cite(12, '2026-09-25', 'Paid', { paidAmount: 50, paidDate: '2026-09-26' }),
];

describe('computeRates', () => {
  const r = computeRates(fixture, ctx, asOf);

  it('counts settled citations without Pending or in-window ones', () => {
    expect(r.counts).toEqual({ settled: 9, paid: 6, unpaid: 2, reversed: 1, allPaid: 7, paidEscalated: 2 });
  });

  it('matches the hand-computed collection, reversal and escalation rates', () => {
    expect(r.collection.computed).toBeCloseTo(6 / 9, 10);
    expect(r.reversal.computed).toBeCloseTo(1 / 9, 10);
    expect(r.escalation.computed).toBeCloseTo(2 / 7, 10);
    expect(r.collection).toMatchObject({ status: 'Computed' });
    expect(r.collection.applied).toBe(r.collection.computed);
  });

  it('keeps the computed value and marks the applied one when overridden', () => {
    const o = computeRates(fixture, ctx, asOf, { collection: 0.5, escalation: 0.1 });
    expect(o.collection).toEqual({ computed: 6 / 9, applied: 0.5, status: 'Manually set' });
    expect(o.escalation).toEqual({ computed: 2 / 7, applied: 0.1, status: 'Manually set' });
    expect(o.reversal.status).toBe('Computed');
  });

  it('moves citations into the settled set as the as-of date advances', () => {
    // On 2026-08-25 only citations dated on or before 2026-08-03 are past 21 days: #1-3, all Paid.
    expect(computeRates(fixture, ctx, '2026-08-25').counts).toMatchObject({ settled: 3, paid: 3, unpaid: 0 });
  });

  it('returns null rates when nothing is settled', () => {
    const none = computeRates([cite(1, '2026-09-29', 'Unpaid')], ctx, asOf);
    expect(none.collection).toEqual({ computed: null, applied: null, status: 'Computed' });
    expect(none.escalation.computed).toBeNull();
  });
});

describe('paidAtEscalated', () => {
  it('treats a missing Paid amount as the Fine amount paid', () => {
    expect(paidAtEscalated(cite(1, '2026-08-01', 'Paid'), 100, 21)).toBe(false);
  });
  it('lets the Paid amount decide when it matches base or escalated', () => {
    expect(paidAtEscalated(cite(1, '2026-08-01', 'Paid', { paidAmount: 100, paidDate: '2026-08-02' }), 100, 21)).toBe(true);
    expect(paidAtEscalated(cite(1, '2026-08-01', 'Paid', { paidAmount: 50, paidDate: '2026-09-20' }), 100, 21)).toBe(false);
  });
  it('falls back to the Paid date only for an amount matching neither', () => {
    const c = (paidDate: string) => cite(1, '2026-08-01', 'Paid', { paidAmount: 75, paidDate });
    expect(paidAtEscalated(c('2026-08-22'), 100, 21)).toBe(false);
    expect(paidAtEscalated(c('2026-08-23'), 100, 21)).toBe(true);
  });
});
