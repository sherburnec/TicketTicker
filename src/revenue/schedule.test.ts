import { describe, expect, it } from 'vitest';
import { loadCity } from '../city/loadCity.ts';
import type { FineEntry } from '../types.ts';
import { asOfDate, daysBetween, escalationStatus, paymentWindow, resolveCitationFine } from './schedule.ts';

const city = { paymentWindowDays: 21 };
const schedule: FineEntry[] = [
  { code: 'BMC-1', name: 'A', base: 55, escalated: 110 },
  { code: 'BMC-1', name: 'A', base: 65, escalated: 130, startDate: '2026-07-01' },
  { code: 'BMC-2', name: 'B', base: 40, escalated: 80, escalationDays: 10 },
];

describe('daysBetween', () => {
  it('counts whole days across month and year ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28);
  });
});

describe('asOfDate', () => {
  const cites = [{ date: '2026-08-01' }, { date: '2026-08-20' }, { date: '2026-08-05' }];
  it('defaults to the latest citation date', () => {
    expect(asOfDate(cites)).toBe('2026-08-20');
    expect(asOfDate([])).toBeUndefined();
  });
  it('is replaced by an override, which changes escalation results', () => {
    expect(asOfDate(cites, '2026-09-30')).toBe('2026-09-30');
    const at = (asOf: string) => resolveCitationFine(schedule, city, 'BMC-1', '2026-08-01', asOf)?.status;
    expect(at(asOfDate(cites)!)).toBe('in-window');
    expect(at(asOfDate(cites, '2026-09-30')!)).toBe('escalated');
  });
});

describe('paymentWindow', () => {
  it('uses the city value of 21 days unless the entry overrides it', () => {
    expect(paymentWindow(schedule[0], city)).toBe(21);
    expect(paymentWindow(schedule[2], city)).toBe(10);
  });
});

describe('escalationStatus', () => {
  it('is in-window through the last day of the window and escalated the day after', () => {
    expect(escalationStatus('2026-08-01', 21, '2026-08-01')).toBe('in-window');
    expect(escalationStatus('2026-08-01', 21, '2026-08-22')).toBe('in-window');
    expect(escalationStatus('2026-08-01', 21, '2026-08-23')).toBe('escalated');
  });
  it('treats an as-of date before the citation as in-window', () => {
    expect(escalationStatus('2026-08-01', 21, '2026-07-01')).toBe('in-window');
  });
});

describe('resolveCitationFine', () => {
  it('picks the entry by citation date, so an old citation keeps the old fine after an increase', () => {
    const old = resolveCitationFine(schedule, city, 'BMC-1', '2026-06-30', '2026-09-01');
    expect(old?.entry.base).toBe(55);
    expect(old?.status).toBe('escalated');
    const next = resolveCitationFine(schedule, city, 'BMC-1', '2026-07-01', '2026-09-01');
    expect(next?.entry.base).toBe(65);
  });
  it('applies the per-entry window override', () => {
    const r = resolveCitationFine(schedule, city, 'BMC-2', '2026-08-01', '2026-08-12');
    expect(r).toMatchObject({ window: 10, status: 'escalated' });
    expect(resolveCitationFine(schedule, city, 'BMC-1', '2026-08-01', '2026-08-12')).toMatchObject({ window: 21, status: 'in-window' });
  });
  it("uses Burbank's 21 days from its city settings", () => {
    const burbank = loadCity('burbank');
    expect(resolveCitationFine(schedule, burbank, 'BMC-1', '2026-08-01', '2026-08-22')).toMatchObject({ window: 21, status: 'in-window' });
    expect(resolveCitationFine(schedule, burbank, 'BMC-1', '2026-08-01', '2026-08-23')?.status).toBe('escalated');
  });
  it('returns undefined for an unknown code', () => {
    expect(resolveCitationFine(schedule, city, 'NOPE-1', '2026-08-01', '2026-08-02')).toBeUndefined();
  });
});
