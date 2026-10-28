import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PatrolAggregate } from '../patrol/aggregate.ts';
import { createR8State } from '../ui/r8Panel.ts';
import { buildR8, hasMotion, legendText, R8_NOTICE } from './r8.ts';

const origin = { lat: 34.14, lon: -118.37 };
// Keys: cell|date|hour|vehicle|motion. 2025-03-10 is a Monday, 2025-03-11 a Tuesday.
function agg(unit: 'minutes' | 'stops' = 'minutes'): PatrolAggregate {
  return {
    format: unit === 'minutes' ? 'A' : 'B', unit, gridMeters: 25, origin, timeZone: 'America/Los_Angeles', vehicles: ['V1', 'V2'],
    cells: new Map([
      ['10:10|2025-03-10|9|0|m', 4],
      ['10:10|2025-03-10|9|1|s', 2],
      ['10:10|2025-03-11|14|0|m', 6],
      ['20:20|2025-03-10|9|0|s', 1],
      ['20:20|2025-03-11|9|1|m', 3],
    ]),
  };
}
const weights = (a: PatrolAggregate, f = {}, scale: 'relative' | 'fixed' = 'relative') =>
  (buildR8(a, f, scale).features.features as { properties: { weight: number; value: number } }[]).map((x) => x.properties).sort((p, q) => q.value - p.value);

describe('R8 filters (RPT-8)', () => {
  const a = agg();
  const total = (f = {}) => buildR8(a, f).total;

  it('sums everything without a filter', () => expect(total()).toBe(16));
  it('filters by date range', () => {
    expect(total({ dateFrom: '2025-03-11' })).toBe(9);
    expect(total({ dateTo: '2025-03-10' })).toBe(7);
    expect(total({ dateFrom: '2025-03-10', dateTo: '2025-03-10' })).toBe(7);
  });
  it('filters by day of week', () => {
    expect(total({ days: [1] })).toBe(7);
    expect(total({ days: [2] })).toBe(9);
    expect(total({ days: [0] })).toBe(0);
  });
  it('filters by hour', () => {
    expect(total({ hours: [9] })).toBe(10);
    expect(total({ hours: [14] })).toBe(6);
  });
  it('filters by vehicle and by moving or stopped', () => {
    expect(total({ vehicle: 0 })).toBe(11);
    expect(total({ vehicle: 1 })).toBe(5);
    expect(total({ motion: 'm' })).toBe(13);
    expect(total({ motion: 's' })).toBe(3);
  });
  it('combines filters', () => {
    expect(total({ days: [1], hours: [9], vehicle: 0 })).toBe(5);
  });
  it('offers the motion filter only for Format A with speed data', () => {
    expect(hasMotion(a)).toBe(true);
    expect(hasMotion(agg('stops'))).toBe(false);
  });
});

describe('R8 colour scale and legend', () => {
  it('states the unit and the scale mode', () => {
    expect(legendText(agg(), 'relative')).toBe('Unit: minutes of vehicle presence per 25 m cell. Colour scale: relative to the current filter.');
    expect(legendText(agg('stops'), 'fixed')).toBe('Unit: stops (not time) per 25 m cell. Colour scale: fixed to the whole data set.');
    expect(buildR8(agg(), {}, 'fixed').legend).toContain('fixed to the whole data set');
  });
  it('normalises to the filtered maximum when relative, and to the whole data set when fixed', () => {
    const a = agg();
    // Cell 10:10 totals 12 overall, cell 20:20 totals 4. Filter to Tuesday: 10:10 = 6, 20:20 = 3.
    expect(weights(a, { days: [2] }, 'relative').map((w) => w.weight)).toEqual([1, 0.5]);
    expect(weights(a, { days: [2] }, 'fixed').map((w) => w.weight)).toEqual([0.5, 0.25]);
  });
  it('shows the patrol notice', () => {
    expect(R8_NOTICE).toContain('Samsara devices only');
    expect(R8_NOTICE).toContain('not officer effort or violations');
    expect(R8_NOTICE).toContain('Foot, bike or untracked patrols are not captured');
    expect(R8_NOTICE).toContain('GPS accuracy limits precision');
    expect(R8_NOTICE).toContain('not measured total enforcement coverage');
  });
});

describe('R8 day-by-hour summary (RPT-10)', () => {
  it('totals each day and hour, ignoring the day and hour filters so a cell can be chosen', () => {
    const v = buildR8(agg(), { days: [2], hours: [14] });
    expect(v.dayHour[1][9]).toBe(7);
    expect(v.dayHour[2][14]).toBe(6);
    expect(v.dayHour[2][9]).toBe(3);
    expect(v.dayHourMax).toBe(7);
    expect(v.total).toBe(6);
  });
  it('applies a clicked cell to the map', () => {
    const state = createR8State(() => agg());
    state.selectCell(1, 9);
    expect(state.filter()).toMatchObject({ days: [1], hours: [9] });
    const view = state.view()!.view;
    expect(view.total).toBe(7);
    expect(view.features.features).toHaveLength(2);
    state.selectCell(2, 14);
    expect(state.view()!.view.total).toBe(6);
  });
  it('keeps other filters when a cell is chosen, and clears them on request', () => {
    const state = createR8State(() => agg());
    state.set({ vehicle: 0 });
    state.selectCell(1, 9);
    expect(state.view()!.view.total).toBe(5);
    state.clear();
    expect(state.view()!.view.total).toBe(16);
  });
  it('has no view without patrol data', () => {
    expect(createR8State(() => undefined).view()).toBeUndefined();
  });
});

describe('R8 independence from citations (RPT-11)', () => {
  it('imports no citation, revenue, officer or report-model code', () => {
    for (const file of ['src/reports/r8.ts', 'src/ui/r8Panel.ts']) {
      const source = readFileSync(file, 'utf8');
      const specs = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of specs) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^(maplibre-gl|\.\.\/map\/|\.\.\/patrol\/aggregate\.ts|\.\.\/reports\/r8\.ts|\.\/r8\.ts|\.\/dom\.ts)/);
      }
    }
  });
});
