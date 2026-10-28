import { codeSource } from '../city/schedule.ts';
import type { Citation, FineResult } from '../types.ts';

/** Every field is optional; an absent or empty field does not restrict (FR-23). */
export interface CitationFilter {
  /** Inclusive ISO dates. */
  dateFrom?: string;
  dateTo?: string;
  /** Day of week, 0 = Sunday to 6 = Saturday. */
  daysOfWeek?: number[];
  /** Hour of day, 0 to 23. */
  hours?: number[];
  codes?: string[];
  /** Code prefix such as CVC or BMC (FR-14c). */
  codeSources?: string[];
  results?: FineResult[];
  blockIds?: string[];
  namedLocationIds?: string[];
}

/** Day of week of an ISO date, independent of the viewer's time zone. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

function allows<T>(list: T[] | undefined, value: T | undefined): boolean {
  return !list || list.length === 0 || (value !== undefined && list.includes(value));
}

export function matchesFilter(c: Citation, f: CitationFilter): boolean {
  if (f.dateFrom && c.date < f.dateFrom) return false;
  if (f.dateTo && c.date > f.dateTo) return false;
  return (
    allows(f.daysOfWeek, dayOfWeek(c.date)) &&
    allows(f.hours, hourOf(c.time)) &&
    allows(f.codes, c.code) &&
    allows(f.codeSources, codeSource(c.code)) &&
    allows(f.results, c.result) &&
    allows(f.blockIds, c.blockId) &&
    allows(f.namedLocationIds, c.namedLocationId)
  );
}

export function applyFilters(citations: Citation[], filter: CitationFilter): Citation[] {
  return citations.filter((c) => matchesFilter(c, filter));
}
