import { describe, expect, it } from 'vitest';
import { csvRecords, patrolRejectsToCsv, readPatrol, type PatrolPoint } from './importer.ts';
import { detectFormat, readHeader } from './formats.ts';

const parseTime = (raw: string) => (raw === '' || Number.isNaN(Date.parse(raw)) ? undefined : Date.parse(raw));

function run(csv: string) {
  const d = detectFormat(readHeader(csv));
  const points: PatrolPoint[] = [];
  const out = readPatrol(csv, d.format, d.mapping, { parseTime }, (p) => points.push(p));
  return { ...out, points, format: d.format };
}

const A_HEAD = 'time,latitude,longitude,vehicle,driver,speedMilesPerHour';
const a = (...rows: string[]) => [A_HEAD, ...rows].join('\n');

describe('csvRecords', () => {
  it('streams quoted cells, CRLF and skips blank lines', () => {
    const rows = [...csvRecords('a,b\r\n"x,1","y ""q"""\r\n\r\nlast,1')].map(([r]) => r);
    expect(rows).toEqual([['a', 'b'], ['x,1', 'y "q"'], ['last', '1']]);
  });
});

describe('Format A validation (DR-13, DR-14, DR-15)', () => {
  it('imports a valid row without the driver, and keeps speed', () => {
    const r = run(a('2025-03-11T10:00:00Z,34.18,-118.3,V1,Jane Driver,12'));
    expect(r.counts).toMatchObject({ read: 1, imported: 1, rejected: 0 });
    expect(r.points).toEqual([{ format: 'A', vehicle: 'V1', time: Date.parse('2025-03-11T10:00:00Z'), lat: 34.18, lon: -118.3, speed: 12 }]);
    expect(JSON.stringify(r)).not.toContain('Jane');
  });

  it.each([
    ['bad time', 'nope,34.18,-118.3,V1,D,5', 'Missing or unreadable time'],
    ['missing time', ',34.18,-118.3,V1,D,5', 'Missing or unreadable time'],
    ['non-numeric latitude', '2025-03-11T10:00:00Z,abc,-118.3,V1,D,5', 'not a number'],
    ['latitude out of range', '2025-03-11T10:00:00Z,134.18,-118.3,V1,D,5', 'out of range'],
    ['longitude out of range', '2025-03-11T10:00:00Z,34.18,-218.3,V1,D,5', 'out of range'],
    ['(0,0)', '2025-03-11T10:00:00Z,0,0,V1,D,5', 'no-fix'],
    ['missing vehicle', '2025-03-11T10:00:00Z,34.18,-118.3,  ,D,5', 'Missing vehicle'],
    ['short row', '2025-03-11T10:00:00Z,34.18', 'Expected at least'],
  ])('rejects %s', (_name, row, reason) => {
    const r = run(a(row));
    expect(r.counts).toMatchObject({ read: 1, imported: 0, rejected: 1 });
    expect(r.rejected[0].reason).toContain(reason);
    expect(r.rejected[0].rowNumber).toBe(2);
  });

  it('ignores and counts duplicates, keeping the first, and out-of-order points', () => {
    const r = run(a(
      '2025-03-11T10:00:00Z,34.18,-118.3,V1,D,5',
      '2025-03-11T10:00:00Z,34.19,-118.3,V1,D,5',
      '2025-03-11T10:00:30Z,34.18,-118.3,V1,D,5',
      '2025-03-11T09:00:00Z,34.18,-118.3,V1,D,5',
      '2025-03-11T10:00:00Z,34.18,-118.3,V2,D,5',
    ));
    expect(r.counts).toMatchObject({ read: 5, imported: 3, duplicates: 1, outOfOrder: 1, rejected: 0 });
    expect(r.points[0]).toMatchObject({ lat: 34.18 });
  });

  it('keeps reject totals consistent: read = imported + rejected + ignored', () => {
    const r = run(a('2025-03-11T10:00:00Z,34.18,-118.3,V1,D,5', 'bad,1,2,V1,D,5', '2025-03-11T10:00:00Z,34.18,-118.3,V1,D,5'));
    expect(r.counts.read).toBe(r.counts.imported + r.counts.rejected + r.counts.duplicates + r.counts.outOfOrder);
  });

  it('writes rejects without driver data', () => {
    const r = run(a('nope,34.18,-118.3,V1,Jane Driver,5'));
    const csv = patrolRejectsToCsv('A', r.rejected);
    expect(csv.split('\n')[0]).toBe('Row,Reason,Time,Latitude,Longitude,Vehicle,Speed');
    expect(csv).toContain('2,Missing or unreadable time,nope,34.18,-118.3,V1,5');
    expect(csv).not.toContain('Jane');
  });

  it('throws when a required column is unmapped or the file is empty', () => {
    expect(() => readPatrol('a,b\n1,2', 'A', { time: 0, latitude: 1 }, { parseTime }, () => {})).toThrow('Missing required column');
    expect(() => readPatrol('', 'A', { time: 0, latitude: 1, longitude: 2, vehicle: 3 }, { parseTime }, () => {})).toThrow('empty');
  });
});

describe('Format B validation', () => {
  const head = 'Asset,Driver,Trip Start Time,Trip Start Location,Trip End Time,Trip End Location';
  const b = (...rows: string[]) => [head, ...rows].join('\n');

  it('turns a trip into start and end stops, reading coordinates or address text', () => {
    const r = run(b('V1,Jane,2025-03-11T10:00:00Z,"34.18, -118.3",2025-03-11T10:20:00Z,100 N Main St'));
    expect(r.format).toBe('B');
    expect(r.points).toEqual([
      { format: 'B', vehicle: 'V1', kind: 'start', time: Date.parse('2025-03-11T10:00:00Z'), location: { lat: 34.18, lon: -118.3 } },
      { format: 'B', vehicle: 'V1', kind: 'end', time: Date.parse('2025-03-11T10:20:00Z'), location: { address: '100 N Main St' } },
    ]);
    expect(JSON.stringify(r)).not.toContain('Jane');
  });

  it('rejects end before start, bad times, missing vehicle and invalid coordinates', () => {
    const r = run(b(
      'V1,D,2025-03-11T10:20:00Z,1 A St,2025-03-11T10:00:00Z,2 A St',
      'V1,D,bad,1 A St,2025-03-11T10:00:00Z,2 A St',
      ',D,2025-03-11T10:00:00Z,1 A St,2025-03-11T10:10:00Z,2 A St',
      'V1,D,2025-03-11T10:00:00Z,"0, 0",2025-03-11T10:10:00Z,2 A St',
    ));
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'Trip end time is before the start time',
      'Missing or unreadable trip start time',
      'Missing vehicle',
      'Trip start: Coordinates are (0,0), a GPS no-fix',
    ]);
  });

  it('keeps a trip with an empty location and ignores a duplicate trip', () => {
    const r = run(b('V1,D,2025-03-11T10:00:00Z,,2025-03-11T10:10:00Z,2 A St', 'V1,D,2025-03-11T10:00:00Z,,2025-03-11T10:10:00Z,2 A St'));
    expect(r.counts).toMatchObject({ imported: 1, duplicates: 2, rejected: 0 });
    expect(r.points[0]).toMatchObject({ location: undefined });
  });
});
