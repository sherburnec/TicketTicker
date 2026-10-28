import { describe, expect, it } from 'vitest';
import { validateRow, FLAG_PAID_MISMATCH, FLAG_PAID_NO_AMOUNT, FLAG_UNKNOWN_CODE, REQUIRED_FIELDS } from './validate.ts';
import type { FineEntry } from '../types.ts';

const schedule: FineEntry[] = [
  { code: 'CVC-22500(g)', name: 'Street sweeping', base: 75, escalated: 100 },
  { code: 'BMC-6-1', name: 'Time limit', base: 65, escalated: 90 },
  { code: 'BMC-6-1', name: 'Time limit', base: 80, escalated: 105, startDate: '2026-07-01' },
];

const good: Record<string, string> = {
  'Citation ID': 'C1',
  Date: '2026-03-10',
  Time: '09:30',
  'Citation code': 'CVC-22500(g)',
  'Officer #': '101',
  'Fine result': 'Unpaid',
  'Fine amount': '75',
  'Paid amount': '',
  'Paid date': '',
  Address: '100 N Main St',
  'Vehicle type': '',
  'Vehicle color': '',
};
const paid = { ...good, 'Fine result': 'Paid', 'Paid amount': '75', 'Paid date': '2026-03-20' };

const run = (overrides: Record<string, string>, seen: string[] = [], base = good) =>
  validateRow({ ...base, ...overrides }, { schedule, seenIds: new Set(seen) });

type Case = { rule: string; name: string; row: Record<string, string>; base?: Record<string, string>; seen?: string[]; reject: string };

const rejects: Case[] = [
  ...REQUIRED_FIELDS.map((f): Case => ({ rule: 'DR-1', name: `missing ${f}`, row: { [f]: '' }, reject: `Missing required field: ${f}` })),
  { rule: 'DR-1', name: 'two missing fields are both named', row: { Date: '', Time: '' }, reject: 'Missing required fields: Date, Time' },
  { rule: 'DR-1', name: 'US date format', row: { Date: '03/10/2026' }, reject: 'Invalid date "03/10/2026"' },
  { rule: 'DR-1', name: 'impossible date', row: { Date: '2026-02-30' }, reject: 'Invalid date "2026-02-30"' },
  { rule: 'DR-1', name: 'time without leading zero', row: { Time: '9:30' }, reject: 'Invalid time "9:30"' },
  { rule: 'DR-1', name: 'hour 24', row: { Time: '24:00' }, reject: 'Invalid time "24:00"' },
  { rule: 'DR-1', name: 'time with seconds', row: { Time: '09:30:15' }, reject: 'Invalid time "09:30:15"' },
  { rule: 'DR-1', name: 'result outside the allowed set', row: { 'Fine result': 'Dismissed' }, reject: 'Invalid Fine result "Dismissed"' },
  { rule: 'DR-1', name: 'result is case-sensitive', row: { 'Fine result': 'paid' }, reject: 'Invalid Fine result "paid"' },
  { rule: 'DR-2', name: 'duplicate ID', row: {}, seen: ['C1'], reject: 'Duplicate Citation ID C1' },
  { rule: 'DR-3', name: 'negative fine amount', row: { 'Fine amount': '-5' }, reject: 'Fine amount is negative (-5)' },
  { rule: 'DR-3', name: 'non-numeric fine amount', row: { 'Fine amount': '$75' }, reject: 'Fine amount is not a number ("$75")' },
  { rule: 'DR-3', name: 'negative paid amount', row: { 'Paid amount': '-1' }, base: paid, reject: 'Paid amount is negative (-1)' },
  { rule: 'DR-3', name: 'non-numeric paid amount', row: { 'Paid amount': 'abc' }, base: paid, reject: 'Paid amount is not a number ("abc")' },
  { rule: 'DR-3', name: 'paid amount on Unpaid', row: { 'Paid amount': '75' }, reject: 'Paid amount on a Unpaid row' },
  { rule: 'DR-3', name: 'paid amount on Pending', row: { 'Fine result': 'Pending', 'Paid amount': '10' }, reject: 'Paid amount on a Pending row' },
  { rule: 'DR-3', name: 'paid amount on Reversed', row: { 'Fine result': 'Reversed', 'Paid amount': '75' }, reject: 'Paid amount on a Reversed row' },
  { rule: 'DR-3', name: 'paid date on Unpaid', row: { 'Paid date': '2026-03-20' }, reject: 'Paid date on a Unpaid row' },
  { rule: 'DR-3', name: 'paid date on Reversed', row: { 'Fine result': 'Reversed', 'Paid date': '2026-03-20' }, reject: 'Paid date on a Reversed row' },
  { rule: '§8.1', name: 'paid date earlier than Date', row: { 'Paid date': '2026-03-09' }, base: paid, reject: 'Paid date 2026-03-09 is earlier than Date 2026-03-10' },
  { rule: '§8.1', name: 'invalid paid date', row: { 'Paid date': '20-03-2026' }, base: paid, reject: 'Invalid Paid date "20-03-2026"' },
  { rule: 'all', name: 'every reason is listed', row: { Date: 'x', 'Fine result': 'Nope' }, reject: 'Invalid date "x" (expected YYYY-MM-DD); Invalid Fine result "Nope" (expected' },
];

describe('validateRow rejects', () => {
  it.each(rejects)('$rule: $name', ({ row, base, seen, reject }) => {
    const r = run(row, seen, base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reject);
  });

  it('keeps the first occurrence of an ID and rejects later ones (DR-2)', () => {
    const ctx = { schedule, seenIds: new Set<string>() };
    expect(validateRow(good, ctx).ok).toBe(true);
    expect(validateRow(good, ctx).ok).toBe(false);
  });

  it('does not reserve the ID of a rejected row', () => {
    const ctx = { schedule, seenIds: new Set<string>() };
    expect(validateRow({ ...good, Date: 'bad' }, ctx).ok).toBe(false);
    expect(validateRow(good, ctx).ok).toBe(true);
  });
});

type Accept = { rule: string; name: string; row: Record<string, string>; base?: Record<string, string>; flags: string[] };

const accepts: Accept[] = [
  { rule: '-', name: 'a clean Unpaid row', row: {}, flags: [] },
  { rule: '-', name: 'a clean Paid row at the fine amount', row: {}, base: paid, flags: [] },
  { rule: 'DR-12', name: 'Paid at the escalated amount', row: { 'Paid amount': '100' }, base: paid, flags: [] },
  { rule: '-', name: 'Pending and Reversed with a zero Paid amount', row: { 'Fine result': 'Reversed', 'Paid amount': '0' }, flags: [] },
  { rule: 'DR-4', name: 'Paid with no Paid amount', row: { 'Paid amount': '' }, base: paid, flags: [FLAG_PAID_NO_AMOUNT] },
  { rule: 'DR-5', name: 'unknown citation code', row: { 'Citation code': 'XYZ-1' }, flags: [FLAG_UNKNOWN_CODE] },
  { rule: 'DR-5', name: 'unknown code Paid at another amount is not also a mismatch', row: { 'Citation code': 'XYZ-1', 'Paid amount': '5' }, base: paid, flags: [FLAG_UNKNOWN_CODE] },
  { rule: 'DR-12', name: 'Paid at a partial amount', row: { 'Paid amount': '40' }, base: paid, flags: [FLAG_PAID_MISMATCH] },
  { rule: 'DR-12', name: 'escalated amount follows the date-resolved entry', row: { 'Citation code': 'BMC-6-1', Date: '2026-08-04', 'Paid date': '2026-08-20', 'Fine amount': '80', 'Paid amount': '105' }, base: paid, flags: [] },
  { rule: 'DR-12', name: 'the old escalated amount is a mismatch after the increase', row: { 'Citation code': 'BMC-6-1', Date: '2026-08-04', 'Paid date': '2026-08-20', 'Fine amount': '80', 'Paid amount': '90' }, base: paid, flags: [FLAG_PAID_MISMATCH] },
  { rule: 'DR-12', name: 'the fine amount in the file wins over the schedule base', row: { 'Fine amount': '50', 'Paid amount': '50' }, base: paid, flags: [] },
];

describe('validateRow accepts and flags', () => {
  it.each(accepts)('$rule: $name', ({ row, base, flags }) => {
    const r = run(row, [], base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.citation.flags).toEqual(flags);
  });

  it('converts the cells to a typed citation', () => {
    const r = run({ 'Vehicle type': 'SUV' }, [], paid);
    expect(r.ok && r.citation).toMatchObject({
      id: 'C1', date: '2026-03-10', time: '09:30', code: 'CVC-22500(g)', officer: '101', result: 'Paid',
      fineAmount: 75, paidAmount: 75, paidDate: '2026-03-20', address: '100 N Main St', vehicleType: 'SUV', vehicleColor: undefined,
    });
  });

  it('ignores columns outside the §8.1 fields, such as a plate (DR-7)', () => {
    const r = validateRow({ ...good, Plate: '7ABC123', Name: 'Jane Doe' }, { schedule, seenIds: new Set() });
    expect(r.ok && JSON.stringify(r.citation)).not.toMatch(/7ABC123|Jane/);
  });
});
