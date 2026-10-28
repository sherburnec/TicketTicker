import type { FeatureCollection } from '../map/style.ts';
import { cellCenter, type Motion, type PatrolAggregate } from '../patrol/aggregate.ts';

// R8 reads the patrol aggregate and nothing else: no citation, revenue or officer module is imported (RPT-11, NG7).

export const R8_NOTICE =
  'Shows vehicle presence from Samsara devices only, not officer effort or violations. Foot, bike or untracked patrols are not captured, and GPS accuracy limits precision. This is not measured total enforcement coverage.';
export const R8_INTERNAL_NOTICE = 'Internal only: patrol data is never included in the city PDF.';

export interface PatrolFilter {
  dateFrom?: string;
  dateTo?: string;
  /** Days of week, 0 = Sunday. Empty or absent means any. */
  days?: number[];
  hours?: number[];
  /** Index into the aggregate's vehicle list; a display filter only (FR-39). */
  vehicle?: number;
  /** Format A with speed data only (RPT-8). */
  motion?: Exclude<Motion, '-'>;
}

export type ScaleMode = 'relative' | 'fixed';

export interface R8View {
  /** One point per cell with a heat weight from 0 to 1, for the map's heatmap layer. */
  features: FeatureCollection;
  /** Sum of the unit (minutes or stops) under the filter. */
  total: number;
  /** Day of week by hour totals under every filter except day and hour, so a cell can be chosen (RPT-10). */
  dayHour: number[][];
  dayHourMax: number;
  legend: string;
}

interface Entry {
  cell: string;
  date: string;
  dow: number;
  hour: number;
  vehicle: number;
  motion: Motion;
  value: number;
}

const parsed = new WeakMap<PatrolAggregate, Entry[]>();

function entries(agg: PatrolAggregate): Entry[] {
  let list = parsed.get(agg);
  if (!list) {
    const dows = new Map<string, number>();
    list = [];
    for (const [key, value] of agg.cells) {
      const [cell, date, hour, vehicle, motion] = key.split('|');
      let dow = dows.get(date);
      if (dow === undefined) dows.set(date, (dow = new Date(`${date}T00:00:00Z`).getUTCDay()));
      list.push({ cell, date, dow, hour: Number(hour), vehicle: Number(vehicle), motion: motion as Motion, value });
    }
    parsed.set(agg, list);
  }
  return list;
}

/** Whether the aggregate has speed data, which enables the moving/stopped filter. */
export function hasMotion(agg: PatrolAggregate): boolean {
  return agg.format === 'A' && entries(agg).some((e) => e.motion !== '-');
}

function passes(e: Entry, f: PatrolFilter, withDayHour: boolean): boolean {
  if (f.dateFrom && e.date < f.dateFrom) return false;
  if (f.dateTo && e.date > f.dateTo) return false;
  if (f.vehicle !== undefined && e.vehicle !== f.vehicle) return false;
  if (f.motion && e.motion !== f.motion) return false;
  if (withDayHour) {
    if (f.days?.length && !f.days.includes(e.dow)) return false;
    if (f.hours?.length && !f.hours.includes(e.hour)) return false;
  }
  return true;
}

/** Legend text: the unit and whether the colour scale follows the current filter or is fixed (RPT-8). */
export function legendText(agg: PatrolAggregate, scale: ScaleMode): string {
  const unit = agg.unit === 'minutes' ? 'minutes of vehicle presence' : 'stops (not time)';
  const mode = scale === 'relative' ? 'relative to the current filter' : 'fixed to the whole data set';
  return `Unit: ${unit} per ${agg.gridMeters} m cell. Colour scale: ${mode}.`;
}

/** R8 heatmap points, totals and day-by-hour summary for a filter (RPT-8, RPT-10). */
export function buildR8(agg: PatrolAggregate, filter: PatrolFilter = {}, scale: ScaleMode = 'relative'): R8View {
  const all = entries(agg);
  const byCell = new Map<string, number>();
  let total = 0;
  const dayHour = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const e of all) {
    if (!passes(e, filter, false)) continue;
    dayHour[e.dow][e.hour] += e.value;
    if (!passes(e, filter, true)) continue;
    byCell.set(e.cell, (byCell.get(e.cell) ?? 0) + e.value);
    total += e.value;
  }

  let denominator = 0;
  if (scale === 'relative') for (const v of byCell.values()) denominator = Math.max(denominator, v);
  else {
    const whole = new Map<string, number>();
    for (const e of all) whole.set(e.cell, (whole.get(e.cell) ?? 0) + e.value);
    for (const v of whole.values()) denominator = Math.max(denominator, v);
  }

  const features = [...byCell].map(([cell, value]) => {
    const [cx, cy] = cell.split(':').map(Number);
    return {
      type: 'Feature',
      properties: { weight: denominator > 0 ? Math.min(1, value / denominator) : 0, value },
      geometry: { type: 'Point', coordinates: cellCenter(cx, cy, agg.origin, agg.gridMeters) },
    };
  });
  return {
    features: { type: 'FeatureCollection', features },
    total,
    dayHour,
    dayHourMax: Math.max(0, ...dayHour.flat()),
    legend: legendText(agg, scale),
  };
}
