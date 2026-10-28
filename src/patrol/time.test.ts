import { describe, expect, it } from 'vitest';
import { isoDate, parseTimestamp, zoneClock } from './time.ts';

const la = zoneClock('America/Los_Angeles');
const p = (s: string) => parseTimestamp(s, la);
const z = (s: string) => Date.parse(s);

describe('patrol timestamps (FR-33)', () => {
  it('reads Z and offset times as the instant they name', () => {
    expect(p('2025-03-11T10:21:19Z')).toBe(z('2025-03-11T10:21:19Z'));
    expect(p('2025-03-11T10:21:19.250Z')).toBe(z('2025-03-11T10:21:19.250Z'));
    expect(p('2025-03-11T03:21:19-07:00')).toBe(z('2025-03-11T10:21:19Z'));
    expect(p('2025-03-11T03:21:19-0700')).toBe(z('2025-03-11T10:21:19Z'));
    expect(p('2025-03-11T15:51:19+05:30')).toBe(z('2025-03-11T10:21:19Z'));
  });

  it('reads epoch seconds and milliseconds', () => {
    expect(p('1741688479')).toBe(1741688479000);
    expect(p('1741688479000')).toBe(1741688479000);
    expect(p('5')).toBeUndefined();
  });

  it('reads times with no zone in the clock zone, in ISO and US styles', () => {
    expect(p('2025-03-11 03:21:19')).toBe(z('2025-03-11T10:21:19Z'));
    expect(p('2025-03-11T03:21')).toBe(z('2025-03-11T10:21:00Z'));
    expect(p('3/11/2025 3:21 PM')).toBe(z('2025-03-11T22:21:00Z'));
    expect(p('3/11/2025 12:05 AM')).toBe(z('2025-03-11T07:05:00Z'));
    expect(parseTimestamp('2025-03-11 03:21:19', zoneClock('UTC'))).toBe(z('2025-03-11T03:21:19Z'));
  });

  it('handles the spring-forward change (2025-03-09)', () => {
    expect(p('2025-03-09 01:30')).toBe(z('2025-03-09T09:30:00Z')); // PST
    expect(p('2025-03-09 03:30')).toBe(z('2025-03-09T10:30:00Z')); // PDT
    expect(p('2025-03-09 02:30')).toBe(z('2025-03-09T10:30:00Z')); // skipped hour reads as 03:30 PDT
  });

  it('handles the fall-back change (2025-11-02)', () => {
    expect(p('2025-11-02 00:30')).toBe(z('2025-11-02T07:30:00Z')); // PDT
    expect(p('2025-11-02 01:30')).toBe(z('2025-11-02T08:30:00Z')); // repeated hour: first occurrence, PDT
    expect(p('2025-11-02 02:30')).toBe(z('2025-11-02T10:30:00Z')); // PST
  });

  it('rejects unreadable times', () => {
    for (const bad of ['', 'nope', '2025-13-01 10:00', '2025-02-30 10:00', '2025-03-11 25:00', '13/45/2025 1:00', '2025-03-11']) {
      expect(p(bad), bad).toBeUndefined();
    }
  });
});

describe('local day and hour', () => {
  it('assigns day of week and hour in the city zone, across the UTC date line', () => {
    const t = z('2025-03-12T02:30:00Z'); // 19:30 PDT on Tuesday 11 March
    expect(la.local(t)).toMatchObject({ hour: 19, dow: 2 });
    expect(isoDate(la.local(t).day)).toBe('2025-03-11');
  });

  it('follows both DST changes', () => {
    expect(la.local(z('2025-03-09T09:59:00Z'))).toMatchObject({ hour: 1, dow: 0 }); // 01:59 PST
    expect(la.local(z('2025-03-09T10:00:00Z'))).toMatchObject({ hour: 3, dow: 0 }); // 03:00 PDT
    expect(la.local(z('2025-11-02T08:30:00Z'))).toMatchObject({ hour: 1, dow: 0 }); // 01:30 PDT
    expect(la.local(z('2025-11-02T09:30:00Z'))).toMatchObject({ hour: 1, dow: 0 }); // 01:30 PST
    expect(la.local(z('2025-11-02T10:00:00Z'))).toMatchObject({ hour: 2, dow: 0 }); // 02:00 PST
  });

  it('rejects an unknown zone', () => {
    expect(() => zoneClock('Not/AZone')).toThrow();
  });
});
