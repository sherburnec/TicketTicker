import type { Citation, FineEntry, FineResult } from '../types.ts';
import { resolveFine } from '../city/schedule.ts';

/** Flag texts, shown as-is in the import summary (DR-4, DR-5, DR-12). */
export const FLAG_UNKNOWN_CODE = 'Unknown citation code';
export const FLAG_UNMATCHED_ADDRESS = 'Unmatched address';
export const FLAG_PAID_NO_AMOUNT = 'Paid without a Paid amount';
export const FLAG_PAID_MISMATCH = 'Paid amount is neither the fine nor the escalated amount';

export interface ValidationContext {
  schedule: FineEntry[];
  /** IDs of the rows accepted so far in this import; the first occurrence of an ID wins (DR-2). */
  seenIds: Set<string>;
}

export type RowResult = { ok: true; citation: Citation } | { ok: false; reason: string };

/** Field names that must be non-blank on every row (§8.1). */
export const REQUIRED_FIELDS = ['Citation ID', 'Date', 'Time', 'Citation code', 'Officer #', 'Fine result', 'Fine amount', 'Address'];
const RESULTS: readonly string[] = ['Paid', 'Unpaid', 'Pending', 'Reversed'];

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Parses a non-negative amount, or says why it cannot be one (DR-3). */
function amount(field: string, raw: string): { value: number } | { error: string } {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return { error: `${field} is not a number ("${raw}")` };
  const value = Number(raw);
  return value < 0 ? { error: `${field} is negative (${raw})` } : { value };
}

/**
 * Applies the row rules of §8.2 to one row's cells, keyed by header name and already trimmed. A row that breaks a reject
 * rule comes back with every reason found; a row that only breaks a flag rule is accepted with its flags. DR-7: only the
 * §8.1 fields are read, so any name or plate column in a file is dropped here.
 */
export function validateRow(cell: Record<string, string>, ctx: ValidationContext): RowResult {
  const reasons: string[] = [];
  const get = (name: string) => cell[name] ?? '';

  // DR-1, DR-2: required fields, formats, result values, unique ID.
  const missing = REQUIRED_FIELDS.filter((name) => get(name) === '');
  if (missing.length > 0) reasons.push(`Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  const id = get('Citation ID');
  if (id !== '' && ctx.seenIds.has(id)) reasons.push(`Duplicate Citation ID ${id}`);
  const date = get('Date');
  if (date !== '' && !isIsoDate(date)) reasons.push(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  const time = get('Time');
  if (time !== '' && !isTime(time)) reasons.push(`Invalid time "${time}" (expected HH:MM, 24-hour)`);
  const result = get('Fine result');
  if (result !== '' && !RESULTS.includes(result)) reasons.push(`Invalid Fine result "${result}" (expected Paid, Unpaid, Pending or Reversed)`);

  // DR-3: amounts and the Paid-only fields.
  let fineAmount = NaN;
  if (get('Fine amount') !== '') {
    const a = amount('Fine amount', get('Fine amount'));
    if ('error' in a) reasons.push(a.error);
    else fineAmount = a.value;
  }
  let paidAmount: number | undefined;
  if (get('Paid amount') !== '') {
    const a = amount('Paid amount', get('Paid amount'));
    if ('error' in a) reasons.push(a.error);
    else paidAmount = a.value;
  }
  const paidDate = get('Paid date');
  if (paidDate !== '') {
    if (!isIsoDate(paidDate)) reasons.push(`Invalid Paid date "${paidDate}" (expected YYYY-MM-DD)`);
    else if (isIsoDate(date) && paidDate < date) reasons.push(`Paid date ${paidDate} is earlier than Date ${date}`);
  }
  if (RESULTS.includes(result) && result !== 'Paid') {
    if (paidAmount !== undefined && paidAmount > 0) reasons.push(`Paid amount on a ${result} row`);
    if (paidDate !== '') reasons.push(`Paid date on a ${result} row`);
  }

  if (reasons.length > 0) return { ok: false, reason: reasons.join('; ') };

  // Accepted: flag rules (DR-4, DR-5, DR-12).
  const flags: string[] = [];
  const code = get('Citation code');
  const entry = resolveFine(ctx.schedule, code, date);
  if (!ctx.schedule.some((e) => e.code === code)) flags.push(FLAG_UNKNOWN_CODE);
  if (result === 'Paid') {
    if (paidAmount === undefined) flags.push(FLAG_PAID_NO_AMOUNT);
    // Without a schedule entry there is no escalated amount to compare against, so the unknown-code flag stands alone.
    else if (entry !== undefined && paidAmount !== fineAmount && paidAmount !== entry.escalated) flags.push(FLAG_PAID_MISMATCH);
  }

  ctx.seenIds.add(id);
  return {
    ok: true,
    citation: {
      id,
      date,
      time,
      code,
      officer: get('Officer #'),
      result: result as FineResult,
      fineAmount,
      paidAmount,
      paidDate: paidDate === '' ? undefined : paidDate,
      address: get('Address'),
      vehicleType: get('Vehicle type') === '' ? undefined : get('Vehicle type'),
      vehicleColor: get('Vehicle color') === '' ? undefined : get('Vehicle color'),
      flags,
    },
  };
}
