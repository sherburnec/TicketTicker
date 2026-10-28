import { describe, expect, it } from 'vitest';
import type { Citation } from '../types.ts';
import { createOfficerState, INTERNAL_NOTICE, OFFICER_NOTICE } from '../ui/officerPanel.ts';
import { buildCoverage, R5_PROXY_LABEL } from './r5.ts';
import { buildOfficerActivity } from './r6.ts';

let n = 0;
const cit = (officer: string, block: string | undefined, time: string, result: Citation['result'] = 'Paid'): Citation => ({
  id: `C${++n}`, date: '2025-03-03', time, code: 'CVC-1', officer, result, fineAmount: 50, address: '1 X', flags: [],
  blockId: block,
});
const data = [
  cit('101', 'b1', '08:10'), cit('101', 'b1', '08:50'), cit('101', 'b2', '13:00', 'Unpaid'),
  cit('202', 'b3', '08:30', 'Reversed'), cit('202', undefined, '09:00'),
];
const segment = (id: string) => ({ type: 'Feature', properties: { segment_id: id }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } });
const segments = { type: 'FeatureCollection' as const, features: ['b1', 'b2', 'b3'].map(segment) };

describe('R5 coverage', () => {
  it('lists officers and their citations by hour', () => {
    const c = buildCoverage(data);
    expect(c.officers).toEqual(['101', '202']);
    expect(c.hours.get('101')![8]).toBe(2);
    expect(c.hours.get('101')![13]).toBe(1);
    expect(c.hours.get('202')![9]).toBe(1);
    expect(c.footprint.size).toBe(0);
  });
  it('builds an officer footprint of blocks, optionally limited to hours', () => {
    expect([...buildCoverage(data, '101').footprint]).toEqual([['b1', 2], ['b2', 1]]);
    expect([...buildCoverage(data, '101', [13]).footprint]).toEqual([['b2', 1]]);
    expect([...buildCoverage(data, '202').footprint]).toEqual([['b3', 1]]);
  });
  it('carries the proxy label', () => {
    expect(R5_PROXY_LABEL).toMatch(/proxy/i);
    expect(R5_PROXY_LABEL).toMatch(/not measured patrol effort/i);
  });
});

describe('R6 officer activity', () => {
  it('counts citations by officer, most first, with results', () => {
    expect(buildOfficerActivity(data)).toEqual([
      { officer: '101', total: 3, byResult: { Paid: 2, Unpaid: 1, Pending: 0, Reversed: 0 } },
      { officer: '202', total: 2, byResult: { Paid: 1, Unpaid: 0, Pending: 0, Reversed: 1 } },
    ]);
  });
});

describe('officer panel state and notices', () => {
  it('has no view without data', () => {
    expect(createOfficerState(() => undefined).view()).toBeUndefined();
  });
  it('maps the selected officer footprint and hour', () => {
    const s = createOfficerState(() => ({ citations: data, segments }));
    expect(s.view()!.map.features).toHaveLength(0);
    s.setOfficer('101');
    expect(s.view()!.map.features).toHaveLength(2);
    s.setHour(13);
    expect(s.view()!.map.features).toHaveLength(1);
  });
  it('states the activity and internal-only notices', () => {
    expect(OFFICER_NOTICE).toMatch(/enforcement activity, not violation rates/);
    expect(INTERNAL_NOTICE).toMatch(/never included in the city PDF/);
  });
});
