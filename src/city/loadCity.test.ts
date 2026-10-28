import { describe, expect, it } from 'vitest';
import { loadCity, parseCity } from './loadCity.ts';

const fixtures = import.meta.glob('/tests/fixtures/cities/*/city.json', { eager: true, import: 'default' });

describe('loadCity', () => {
  it('loads Burbank from data/burbank', () => {
    const c = loadCity('burbank');
    expect(c.name).toBe('Burbank, CA');
    expect(c.timeZone).toBe('America/Los_Angeles');
    expect(c.paymentWindowDays).toBe(21);
    expect('bbox' in c.extent).toBe(true);
  });

  it('loads a second city folder with no code change', () => {
    const c = loadCity('testville', fixtures);
    expect(c.timeZone).toBe('America/New_York');
    expect(c.paymentWindowDays).toBe(14);
    expect('polygon' in c.extent).toBe(true);
    expect(c.exclusionZones).toEqual([{ lat: 40.05, lon: -73.95, radiusM: 200 }]);
    expect(c.hotZoneWeights).toHaveLength(1);
  });

  it('throws for an unknown city', () => {
    expect(() => loadCity('nowhere')).toThrow(/no city.json/);
  });

  it('rejects an invalid time zone and a missing payment window', () => {
    const base = { city_id: 'x', name: 'X', extent: { bbox: [0, 0, 1, 1] }, depot: { lat: 0, lon: 0 } };
    expect(() => parseCity({ ...base, time_zone: 'Mars/Base', payment_window_days: 21 })).toThrow(/time_zone/);
    expect(() => parseCity({ ...base, time_zone: 'UTC' })).toThrow(/payment_window_days/);
  });
});
