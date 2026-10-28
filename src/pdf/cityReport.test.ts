import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { BlockInfo } from '../geo/matcher.ts';
import type { Citation, NamedLocation } from '../types.ts';
import { buildCityPdf, buildCityReportModel } from './cityReport.ts';

/** Text shown by every `(...) Tj` in the PDF's content streams, inflating them when compressed. */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(m[1], 'latin1');
    try {
      body = inflateSync(body);
    } catch {
      /* stream was not compressed */
    }
    // pdf-lib writes shown text as a hex string; accept a literal string too.
    for (const t of body.toString('latin1').matchAll(/<([0-9a-fA-F\s]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      out.push(t[1] !== undefined ? Buffer.from(t[1].replace(/\s/g, ''), 'hex').toString('latin1') : t[2].replace(/\\(.)/g, '$1'));
    }
  }
  return out.join('\n');
}

const blocks: BlockInfo[] = [
  { id: 'seg-A', street: 'A Street', blockNumber: 100, lowAddress: null, highAddress: null },
  { id: 'seg-B', street: 'B Street', blockNumber: 200, lowAddress: null, highAddress: null },
];
const named: NamedLocation[] = [{ id: 'L1', name: 'Mall', addresses: ['100 A Street'] }];
const schedule = [{ code: 'CVC-1', name: 'Expired meter', base: 50, escalated: 100 }];
const ctx = { schedule, city: { paymentWindowDays: 21 } };

let n = 0;
const cit = (date: string, result: Citation['result'], extra: Partial<Citation> = {}): Citation => ({
  id: `C${++n}`, date, time: '09:00', code: 'CVC-1', officer: 'OFFICER-7731', result, fineAmount: 50,
  address: '1 X', flags: [], blockId: 'seg-A', ...extra,
});
const data: Citation[] = [
  cit('2025-01-05', 'Paid', { paidAmount: 50, namedLocationId: 'L1' }),
  cit('2025-01-06', 'Unpaid'),
  cit('2025-02-05', 'Paid', { paidAmount: 50, blockId: 'seg-B' }),
  cit('2025-03-05', 'Pending'),
];

describe('R7 city PDF', () => {
  const model = buildCityReportModel('Burbank', data, blocks, named, ctx, '2025-03-10');

  it('states the as-of date, rates with status labels, and Realized/Projected labels', async () => {
    const text = pdfText(new Uint8Array(await (await buildCityPdf(model)).arrayBuffer()));
    expect(text).toContain('As of 2025-03-10');
    expect(text).toContain('Realized revenue: $100.00');
    expect(text).toContain('Projected revenue:');
    for (const name of ['Collection rate', 'Escalation rate', 'Reversal rate']) expect(text).toContain(name);
    expect(text).toContain('Computed');
    expect(text).toContain('100 block of A Street');
    expect(text).toContain('Mall');
  });

  it('labels a manual override as Manually set', async () => {
    const m = buildCityReportModel('Burbank', data, blocks, named, ctx, '2025-03-10', { collection: 0.5 });
    const text = pdfText(new Uint8Array(await (await buildCityPdf(m)).arrayBuffer()));
    expect(text).toContain('Manually set');
  });

  it('contains no officer numbers or patrol content', async () => {
    const bytes = new Uint8Array(await (await buildCityPdf(model)).arrayBuffer());
    const text = pdfText(bytes).toLowerCase();
    expect(text.length).toBeGreaterThan(100);
    expect(JSON.stringify(model)).not.toContain('OFFICER-7731');
    for (const word of ['officer-7731', 'officer', 'patrol', 'samsara']) expect(text).not.toContain(word);
  });
});
