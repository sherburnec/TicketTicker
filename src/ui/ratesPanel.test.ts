import { describe, expect, it } from 'vitest';
import { createRatesState } from './ratesPanel.ts';
import type { Citation, FineEntry } from '../types.ts';

const ctx = {
  city: { paymentWindowDays: 21 },
  schedule: [{ code: 'BMC-1', name: 'A', base: 50, escalated: 100 }] as FineEntry[],
};
let n = 0;
const cite = (date: string, result: Citation['result'], extra: Partial<Citation> = {}): Citation => ({
  id: `C${++n}`, date, time: '10:00', code: 'BMC-1', officer: '1001', result, fineAmount: 50, address: '1 A ST', flags: [], ...extra,
});
// Settled as of 2026-09-30: 3 Paid + 1 Unpaid (collection 75%); one Unpaid in-window.
const citations = [
  cite('2026-08-01', 'Paid'), cite('2026-08-02', 'Paid'), cite('2026-08-03', 'Paid'), cite('2026-08-04', 'Unpaid'),
  cite('2026-09-28', 'Unpaid'),
];

describe('rates panel state', () => {
  it('has no view without data', () => {
    expect(createRatesState(() => undefined).view()).toBeUndefined();
    expect(createRatesState(() => ({ citations: [], ctx })).view()).toBeUndefined();
  });

  it('shows computed and applied values with the Computed label by default', () => {
    const v = createRatesState(() => ({ citations, ctx })).view()!;
    expect(v.asOf).toBe('2026-09-28');
    const collection = v.rows.find((r) => r.name === 'Collection rate')!;
    expect(collection).toMatchObject({ computed: '75.0%', applied: '75.0%', status: 'Computed' });
  });

  it('recomputes immediately on override, keeping the computed value and labelling it Manually set', () => {
    const s = createRatesState(() => ({ citations, ctx }));
    const before = s.view()!.projection.projected.avg;
    expect(s.setOverride('collection', 0.5)).toBe(true);
    const v = s.view()!;
    expect(v.rows.find((r) => r.name === 'Collection rate')).toMatchObject({ computed: '75.0%', applied: '50.0%', status: 'Manually set' });
    expect(v.projection.projected.avg).toBeCloseTo((before / 0.75) * 0.5, 10);
    s.clearOverride('collection');
    expect(s.view()!.projection.projected.avg).toBeCloseTo(before, 10);
    expect(s.view()!.rows[0].status).toBe('Computed');
  });

  it('overrides the escalation rate and rejects out-of-range values', () => {
    const s = createRatesState(() => ({ citations, ctx }));
    expect(s.setOverride('escalation', 1.5)).toBe(false);
    expect(s.setOverride('escalation', Number.NaN)).toBe(false);
    expect(s.view()!.rows.find((r) => r.name === 'Escalation rate')!.status).toBe('Computed');
    s.setOverride('escalation', 1);
    // In-window Unpaid expected amount is the escalated 100 when everyone is assumed to pay late.
    expect(s.view()!.projection.outstanding.expected).toBe(100 + 100);
  });

  it('does not offer to override the reversal rate', () => {
    const rows = createRatesState(() => ({ citations, ctx })).view()!.rows;
    expect(rows.find((r) => r.name === 'Reversal rate')!.override).toBeUndefined();
  });

  it('recomputes from an as-of override', () => {
    const s = createRatesState(() => ({ citations, ctx }));
    s.setAsOf('2026-12-31');
    const v = s.view()!;
    expect(v.asOf).toBe('2026-12-31');
    expect(v.projection.rates.counts.settled).toBe(5);
    s.setAsOf('');
    expect(s.view()!.asOf).toBe('2026-09-28');
  });
});
