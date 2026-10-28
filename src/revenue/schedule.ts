import { resolveFine } from '../city/schedule.ts';
import type { CitySettings, FineEntry } from '../types.ts';

export type EscalationStatus = 'in-window' | 'escalated';

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(iso) / DAY_MS);
}

/** Whole days from ISO date `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Payment window in days: the entry's override, else the city value (FR-14b). */
export function paymentWindow(entry: FineEntry, city: Pick<CitySettings, 'paymentWindowDays'>): number {
  return entry.escalationDays ?? city.paymentWindowDays;
}

/** A citation is in-window through citation date + window days, and escalated after that (FR-15). */
export function escalationStatus(citationDate: string, window: number, asOf: string): EscalationStatus {
  return daysBetween(citationDate, asOf) > window ? 'escalated' : 'in-window';
}

export interface ResolvedFine {
  entry: FineEntry;
  window: number;
  status: EscalationStatus;
}

/**
 * The fine applying to a citation: the entry chosen by citation date, not report date (FR-14a, A19),
 * with its window and escalation status at `asOf`. Undefined when the code has no schedule entry.
 */
export function resolveCitationFine(
  schedule: FineEntry[],
  city: Pick<CitySettings, 'paymentWindowDays'>,
  code: string,
  citationDate: string,
  asOf: string,
): ResolvedFine | undefined {
  const entry = resolveFine(schedule, code, citationDate);
  if (!entry) return undefined;
  const window = paymentWindow(entry, city);
  return { entry, window, status: escalationStatus(citationDate, window, asOf) };
}
