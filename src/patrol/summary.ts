import type { PatrolAggregate } from './aggregate.ts';
import type { ExcludedCounts } from './extent.ts';
import type { PatrolFormat } from './formats.ts';
import type { PatrolCounts } from './importer.ts';

/** What the user sees after a patrol import (FR-34), including the zone applied (FR-33). */
export interface PatrolSummary {
  format: PatrolFormat;
  /** Zone applied to times with no UTC marker or offset (FR-33). */
  timeZone: string;
  /** City zone used for day of week and hour. */
  cityTimeZone: string;
  counts: PatrolCounts;
  excluded: ExcludedCounts;
  excludedTotal: number;
  /** Local dates covered, ISO; absent when nothing was imported. */
  dateRange?: { from: string; to: string };
  /** A count only; no vehicle is named or ranked (FR-39). */
  vehicleCount: number;
  /** Format A only (FR-36). */
  medianPingSeconds?: number;
  /** Day-of-week (0 = Sunday) and hour cells with no data at all, so gaps show before the heatmap is read. */
  emptyDayHours: { dow: number; hour: number }[];
  /** Format B stops whose address matched no block. */
  unmatchedStops: number;
}

const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function summarize(
  aggregate: PatrolAggregate,
  counts: PatrolCounts,
  excluded: ExcludedCounts,
  medianPingSeconds: number | undefined,
  unmatchedStops: number,
  timeZone: string,
): PatrolSummary {
  let from: string | undefined;
  let to: string | undefined;
  const seen = new Set<number>();
  const dowByDate = new Map<string, number>();
  for (const key of aggregate.cells.keys()) {
    const [, date, hour] = key.split('|');
    if (from === undefined || date < from) from = date;
    if (to === undefined || date > to) to = date;
    let dow = dowByDate.get(date);
    if (dow === undefined) dowByDate.set(date, (dow = dowOf(date)));
    seen.add(dow * 24 + Number(hour));
  }
  const emptyDayHours: PatrolSummary['emptyDayHours'] = [];
  for (let i = 0; i < 168; i++) if (!seen.has(i)) emptyDayHours.push({ dow: Math.floor(i / 24), hour: i % 24 });
  return {
    format: aggregate.format,
    timeZone,
    cityTimeZone: aggregate.timeZone,
    counts,
    excluded,
    excludedTotal: Object.values(excluded).reduce((a, b) => a + b, 0),
    dateRange: from && to ? { from, to } : undefined,
    vehicleCount: aggregate.vehicles.length,
    medianPingSeconds,
    emptyDayHours,
    unmatchedStops,
  };
}
