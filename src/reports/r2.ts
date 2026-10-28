import type { Citation } from '../types.ts';
import { dayOfWeek, hourOf } from './filters.ts';

export interface TimeHeatmap {
  /** counts[day][hour], day 0 = Sunday to 6 = Saturday, hour 0 to 23. */
  counts: number[][];
  max: number;
  total: number;
}

/** R2 Time patterns: day-of-week by hour counts. Filter the citations first for a per-type view (§9). */
export function buildTimeHeatmap(citations: Citation[]): TimeHeatmap {
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let max = 0;
  for (const c of citations) {
    const n = ++counts[dayOfWeek(c.date)][hourOf(c.time)];
    if (n > max) max = n;
  }
  return { counts, max, total: citations.length };
}

/** The busiest day/hour cells, most citations first, ties broken by day then hour. */
export function topWindows(heatmap: TimeHeatmap, n = 5): { day: number; hour: number; count: number }[] {
  const cells: { day: number; hour: number; count: number }[] = [];
  heatmap.counts.forEach((hours, day) => hours.forEach((count, hour) => count > 0 && cells.push({ day, hour, count })));
  return cells.sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour).slice(0, n);
}
