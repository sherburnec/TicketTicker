import type { Citation, CitySettings, FineEntry } from '../types.ts';
import { daysBetween, resolveCitationFine } from './schedule.ts';

export type RateStatus = 'Computed' | 'Manually set';

/** A rate with the value computed from the data and the value applied after any manual override (FR-19, FR-20). */
export interface Rate {
  computed: number | null;
  applied: number | null;
  status: RateStatus;
}

export interface RateOverrides {
  collection?: number;
  escalation?: number;
}

export interface RateCounts {
  /** Paid + Unpaid + Reversed past the payment window; Pending is never settled. */
  settled: number;
  paid: number;
  unpaid: number;
  reversed: number;
  /** All Paid citations, the escalation-rate denominator. */
  allPaid: number;
  paidEscalated: number;
}

export interface Rates {
  collection: Rate;
  reversal: Rate;
  escalation: Rate;
  counts: RateCounts;
}

export interface RateContext {
  schedule: FineEntry[];
  city: Pick<CitySettings, 'paymentWindowDays'>;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Whether a Paid citation was paid at the escalated amount (§10). The Paid amount decides when it matches the
 * base or escalated amount; a missing Paid amount means the Fine amount was paid (DR-4); an amount matching
 * neither falls back to the Paid date against citation date plus the payment window.
 */
export function paidAtEscalated(c: Citation, escalatedAmount: number | undefined, window: number): boolean {
  if (c.paidAmount === undefined) return false;
  const paid = cents(c.paidAmount);
  if (paid === cents(c.fineAmount)) return false;
  if (escalatedAmount !== undefined && paid === cents(escalatedAmount)) return true;
  return c.paidDate !== undefined && daysBetween(c.date, c.paidDate) > window;
}

function rate(computed: number | null, override: number | undefined): Rate {
  return override === undefined ? { computed, applied: computed, status: 'Computed' } : { computed, applied: override, status: 'Manually set' };
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

/** Collection, reversal and escalation rates over settled citations as of `asOf` (FR-19, FR-21, §10). */
export function computeRates(citations: Citation[], ctx: RateContext, asOf: string, overrides: RateOverrides = {}): Rates {
  const counts: RateCounts = { settled: 0, paid: 0, unpaid: 0, reversed: 0, allPaid: 0, paidEscalated: 0 };

  for (const c of citations) {
    if (c.result === 'Pending') continue;
    const fine = resolveCitationFine(ctx.schedule, ctx.city, c.code, c.date, asOf);
    const window = fine?.window ?? ctx.city.paymentWindowDays;
    const settled = (fine?.status ?? (daysBetween(c.date, asOf) > window ? 'escalated' : 'in-window')) === 'escalated';

    if (c.result === 'Paid') {
      counts.allPaid++;
      if (paidAtEscalated(c, fine?.entry.escalated, window)) counts.paidEscalated++;
    }
    if (!settled) continue;
    counts.settled++;
    if (c.result === 'Paid') counts.paid++;
    else if (c.result === 'Unpaid') counts.unpaid++;
    else counts.reversed++;
  }

  return {
    collection: rate(ratio(counts.paid, counts.settled), overrides.collection),
    reversal: rate(ratio(counts.reversed, counts.settled), undefined),
    escalation: rate(ratio(counts.paidEscalated, counts.allPaid), overrides.escalation),
    counts,
  };
}
