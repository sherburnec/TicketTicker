import { describe, expect, it } from 'vitest';
import { parseNamedLocations } from '../city/schedule.ts';
import type { Citation, NamedLocation } from '../types.ts';
import { buildLocationHistory } from './r4.ts';

let n = 0;
const cit = (loc: string | undefined, date: string, time = '10:00'): Citation => ({
  id: `C${++n}`, date, time, code: 'CVC-1', officer: '1', result: 'Paid', fineAmount: 50, address: '1 X', flags: [],
  namedLocationId: loc,
});
const locations: NamedLocation[] = [
  { id: 'L1', name: 'Mall', addresses: ['1 A St'] },
  { id: 'L2', name: 'Quiet', addresses: ['2 B St'] },
];
const data = [
  cit('L1', '2025-01-15'), cit('L1', '2025-01-20', '08:00'), cit('L1', '2025-01-20', '17:30'),
  cit('L1', '2025-04-02'), cit('L1', '2024-12-31'), cit(undefined, '2025-02-01'),
];

describe('R4 location history', () => {
  const h = buildLocationHistory(locations[0], data);
  it('lists the history newest first', () => {
    expect(h.total).toBe(5);
    expect(h.history.map((c) => `${c.date} ${c.time}`)).toEqual([
      '2025-04-02 10:00', '2025-01-20 17:30', '2025-01-20 08:00', '2025-01-15 10:00', '2024-12-31 10:00',
    ]);
  });
  it('gives a monthly trend with zero-count gap months, across a year boundary', () => {
    expect(h.trend).toEqual([
      { month: '2024-12', count: 1 }, { month: '2025-01', count: 3 }, { month: '2025-02', count: 0 },
      { month: '2025-03', count: 0 }, { month: '2025-04', count: 1 },
    ]);
  });
  it('opens any named location, including one with no citations', () => {
    const e = buildLocationHistory(locations[1], data);
    expect(e).toMatchObject({ id: 'L2', name: 'Quiet', total: 0, history: [], trend: [] });
  });
  it('opens every location in the Burbank named-locations file', async () => {
    const { readFileSync } = await import('node:fs');
    const burbank = parseNamedLocations(readFileSync('data/burbank/named-locations.csv', 'utf8'));
    expect(burbank.length).toBeGreaterThan(0);
    for (const loc of burbank) expect(buildLocationHistory(loc, [cit(loc.id, '2025-05-05')]).total).toBe(1);
  });
});
