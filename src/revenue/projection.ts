import { REVENUE_DEFAULTS } from '../sample/config.ts';
import type { Citation } from '../types.ts';
import { computeRates, type RateContext, type RateOverrides, type Rates } from './rates.ts';
import { resolveCitationFine } from './schedule.ts';

export interface MonthlyRate {
  /** YYYY-MM of the citation date. */
  month: string;
  settled: number;
  /** Collection rate for the month; null with nothing settled (FR-22a). */
  rate: number | null;
  /** False when the month has fewer settled citations than the threshold, so it is left out of low/high. */
  qualifies: boolean;
}

export interface Projection {
  /** Realized revenue: Paid amount on Paid citations (FR-18). */
  realized: { label: 'Realized'; amount: number };
  /** Pending citations, shown apart from projections (FR-21). */
  pending: { count: number; amount: number };
  /** Outstanding Unpaid citations and their summed expected amount, before the collection rate. */
  outstanding: { count: number; expected: number };
  /** Projected revenue as average, low and high; low/high are null when the range is hidden (FR-22b). */
  projected: { label: 'Projected'; avg: number; low: number | null; high: number | null; rangeNotice?: string };
  months: MonthlyRate[];
  /** True when the settled citations behind the rates are fewer than the threshold (FR-22). */
  lowCountWarning: boolean;
  threshold: number;
  rates: Rates;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * Realized revenue, projections, the low/high range and the monthly trend as of `asOf` (FR-17, FR-18, FR-21, FR-22, FR-22a, FR-22b, §10).
 * Projected value of an outstanding Unpaid citation = expected amount x collection rate; low and high use the
 * lowest and highest qualifying monthly collection rates.
 */
export function project(
  citations: Citation[],
  ctx: RateContext,
  asOf: string,
  overrides: RateOverrides = {},
  threshold: number = REVENUE_DEFAULTS.minSettledCitations,
): Projection {
  const rates = computeRates(citations, ctx, asOf, overrides);
  const collection = rates.collection.applied ?? 0;
  const escalation = rates.escalation.applied ?? 0;

  let realized = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  let outstandingCount = 0;
  let expected = 0;
  const byMonth = new Map<string, Citation[]>();

  for (const c of citations) {
    const m = monthKey(c.date);
    const group = byMonth.get(m);
    if (group) group.push(c);
    else byMonth.set(m, [c]);

    if (c.result === 'Paid') realized += c.paidAmount ?? c.fineAmount;
    else if (c.result === 'Pending') {
      pendingCount++;
      pendingAmount += c.fineAmount;
    } else if (c.result === 'Unpaid') {
      const fine = resolveCitationFine(ctx.schedule, ctx.city, c.code, c.date, asOf);
      if (!fine) continue;
      outstandingCount++;
      const { base, escalated } = fine.entry;
      expected += fine.status === 'escalated' ? escalated : base * (1 - escalation) + escalated * escalation;
    }
  }

  const months: MonthlyRate[] = [...byMonth.keys()].sort().map((month) => {
    const { counts, collection: r } = computeRates(byMonth.get(month)!, ctx, asOf);
    return { month, settled: counts.settled, rate: r.computed, qualifies: counts.settled >= threshold && r.computed !== null };
  });

  const qualifying = months.filter((m) => m.qualifies).map((m) => m.rate!);
  const projected: Projection['projected'] = { label: 'Projected', avg: expected * collection, low: null, high: null };
  if (rates.collection.status === 'Manually set') {
    projected.rangeNotice = 'Range hidden: the collection rate is manually set.';
  } else if (qualifying.length < 2) {
    projected.rangeNotice = `Range hidden: fewer than two months have at least ${threshold} settled citations.`;
  } else {
    projected.low = expected * Math.min(...qualifying);
    projected.high = expected * Math.max(...qualifying);
  }

  return {
    realized: { label: 'Realized', amount: realized },
    pending: { count: pendingCount, amount: pendingAmount },
    outstanding: { count: outstandingCount, expected },
    projected,
    months,
    lowCountWarning: rates.counts.settled < threshold,
    threshold,
    rates,
  };
}
