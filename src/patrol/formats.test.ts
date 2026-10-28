import { describe, expect, it } from 'vitest';
import { applyMapping } from '../ui/columnMapper.ts';
import { detectAs, detectFormat, readHeader } from './formats.ts';

describe('patrol format detection', () => {
  it('detects Format A from Samsara field names and aliases', () => {
    const d = detectFormat(['happenedAtTime', 'latitude', 'longitude', 'vehicle', 'speedMilesPerHour', 'headingDegrees', 'formattedLocation', 'driver']);
    expect(d.format).toBe('A');
    expect(d.missing).toEqual([]);
    expect(d.mapping).toEqual({ time: 0, latitude: 1, longitude: 2, vehicle: 3, speed: 4 });
    expect(detectFormat(['Timestamp', 'LAT', 'Lng', 'Vehicle Name']).mapping).toEqual({ time: 0, latitude: 1, longitude: 2, vehicle: 3 });
  });

  it('detects Format B from Trip History headers, ignoring driver and distance', () => {
    const d = detectFormat(['Asset', 'Driver', 'Trip Start Time', 'Trip Start Location', 'Trip End Time', 'Trip End Location', 'Distance (mi)']);
    expect(d.format).toBe('B');
    expect(d.missing).toEqual([]);
    expect(d.mapping).toEqual({ vehicle: 0, startTime: 2, startLocation: 3, endTime: 4, endLocation: 5 });
    expect(Object.values(d.mapping)).not.toContain(1);
  });

  it('reports unrecognized headers as missing fields so the mapper opens', () => {
    const d = detectFormat(['when', 'y', 'x', 'unit']);
    expect(d.missing.map((f) => f.key)).toEqual(['time', 'latitude', 'longitude', 'vehicle']);
    const partial = detectFormat(['time', 'lat', 'lon', 'truck']);
    expect(partial.format).toBe('A');
    expect(partial.missing.map((f) => f.key)).toEqual(['vehicle']);
    expect(partial.mapping).toEqual({ time: 0, latitude: 1, longitude: 2 });
  });

  it('reads only the header row, tolerating a BOM and quotes', () => {
    expect(readHeader('﻿time,"lat",lon\r\n1,2,3\n')).toEqual(['time', 'lat', 'lon']);
    expect(readHeader('a,b')).toEqual(['a', 'b']);
  });

  it('re-resolves for a user-chosen format', () => {
    expect(detectAs(['Asset', 'Trip Start Time'], 'B').mapping).toEqual({ vehicle: 0, startTime: 1 });
  });
});

describe('column mapper', () => {
  it('accepts a complete mapping', () => {
    expect(applyMapping('A', { time: 3, latitude: 1, longitude: 2, vehicle: 0 })).toEqual({ mapping: { time: 3, latitude: 1, longitude: 2, vehicle: 0 } });
  });
  it('rejects a missing required field and a column used twice', () => {
    expect(applyMapping('A', { time: 0, latitude: 1, longitude: 2 })).toEqual({ error: 'Choose a column for "Vehicle".' });
    expect(applyMapping('A', { time: 0, latitude: 1, longitude: 1, vehicle: 3 })).toMatchObject({ error: expect.stringContaining('cannot be both') });
  });
});
