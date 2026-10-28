import { describe, expect, it } from 'vitest';
import { patrolSummaryLines, emptyCellLines } from '../ui/patrolSummary.ts';
import { detectFormat, readHeader } from './formats.ts';
import { importPatrol, type PatrolCity } from './importer.ts';

const settings = {
  id: 't', name: 'Test', timeZone: 'America/Los_Angeles', paymentWindowDays: 21,
  extent: { bbox: [-118.37, 34.14, -118.27, 34.22] as [number, number, number, number] },
  exclusionZones: [], depot: { lat: 34.18, lon: -118.31 },
};
const city: PatrolCity = {
  settings,
  blocks: [{ id: 'seg-A', street: 'Main Street', blockNumber: 100, lowAddress: null, highAddress: null }],
  namedLocations: [],
  segments: { features: [{ properties: { segment_id: 'seg-A' }, geometry: { coordinates: [[-118.3, 34.18], [-118.302, 34.182]] } }] },
};

function run(csv: string, timeZone = settings.timeZone) {
  const d = detectFormat(readHeader(csv));
  return importPatrol({ csv, format: d.format, columns: d.mapping, timeZone, city });
}

describe('patrol import summary (FR-33, FR-34)', () => {
  const csv = [
    'time,latitude,longitude,vehicle,driver',
    '2025-03-11T17:00:00Z,34.17,-118.3,V1,Jane',
    '2025-03-11T17:00:30Z,34.17,-118.3,V1,Jane',
    '2025-03-11T17:01:00Z,34.17,-118.3,V1,Jane',
    '2025-03-11T17:00:00Z,34.17,-118.3,V2,Joe',
    '2025-03-11T17:00:30Z,34.17,-118.3,V2,Joe',
    '2025-03-11T17:00:35Z,35.5,-118.3,V2,Joe', // outside extent
    '2025-03-11T17:00:45Z,34.1805,-118.3102,V2,Joe', // depot
    'bad,34.17,-118.3,V2,Joe', // rejected
  ].join('\n');

  it('reports rows, rejects, exclusions, date range, vehicles, median ping and empty cells', () => {
    const { summary, rejected, excluded } = run(csv);
    expect(summary.counts).toMatchObject({ read: 8, imported: 7, rejected: 1 });
    expect(rejected).toHaveLength(1);
    expect(excluded).toMatchObject({ 'Outside city extent': 1, 'Inside depot zone': 1 });
    expect(summary.excludedTotal).toBe(2);
    expect(summary.dateRange).toEqual({ from: '2025-03-11', to: '2025-03-11' });
    expect(summary.vehicleCount).toBe(2);
    expect(summary.medianPingSeconds).toBe(30);
    expect(summary.emptyDayHours).toHaveLength(167); // only Tuesday 10:00 has data
    expect(summary.emptyDayHours.some((c) => c.dow === 2 && c.hour === 10)).toBe(false);
    expect(summary.timeZone).toBe('America/Los_Angeles');
    expect(summary.cityTimeZone).toBe('America/Los_Angeles');
  });

  it('states every FR-34 field and the zone applied', () => {
    const text = patrolSummaryLines(run(csv).summary).join('\n');
    for (const part of ['America/Los_Angeles', 'Rows read: 8', 'Rejected: 1', 'Points excluded: 2', 'Date range: 2025-03-11 to 2025-03-11', 'Vehicles: 2', 'Median ping interval: 30 seconds', 'with no data: 167 of 168']) {
      expect(text).toContain(part);
    }
    expect(emptyCellLines(run(csv).summary).find((l) => l.startsWith('Tue'))).toContain('00 01');
    expect(emptyCellLines(run(csv).summary).find((l) => l.startsWith('Sun'))).toContain('all hours');
  });

  it('uses the selected zone for naive times', () => {
    const naive = 'time,latitude,longitude,vehicle\n2025-03-11 10:00:00,34.17,-118.3,V1\n2025-03-11 10:00:30,34.17,-118.3,V1\n';
    expect(run(naive, 'America/Los_Angeles').summary.emptyDayHours.some((c) => c.dow === 2 && c.hour === 10)).toBe(false);
    expect(run(naive, 'UTC').summary.emptyDayHours.some((c) => c.dow === 2 && c.hour === 10)).toBe(true);
    expect(run(naive, 'UTC').summary.emptyDayHours.some((c) => c.dow === 2 && c.hour === 3)).toBe(false); // 10:00 UTC is 03:00 PDT in the city
    expect(run(naive, 'UTC').summary.timeZone).toBe('UTC');
  });

  it('has no driver field anywhere in the result', () => {
    const r = run(csv);
    expect(JSON.stringify({ ...r, aggregate: { ...r.aggregate, cells: [...r.aggregate.cells] } })).not.toMatch(/Jane|Joe|driver/i);
  });

  it('places Format B address stops on blocks and lists the rest', () => {
    const b = [
      'Asset,Driver,Trip Start Time,Trip Start Location,Trip End Time,Trip End Location',
      'V1,Jane,2025-03-11T17:00:00Z,150 Main St,2025-03-11T17:10:00Z,9 Nowhere Rd',
    ].join('\n');
    const r = run(b);
    expect(r.summary.format).toBe('B');
    expect(r.summary.unmatchedStops).toBe(1);
    expect(r.unmatched).toEqual([{ address: '9 Nowhere Rd', count: 1 }]);
    expect([...r.aggregate.cells.values()].reduce((a, c) => a + c, 0)).toBe(1);
  });
});
