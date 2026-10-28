import { describe, expect, it } from 'vitest';
import { flagCounts, rejectsToCsv, unmatchedByAddress } from './importSummary.ts';
import { importCitations } from '../import/citations.ts';
import { parseCsv } from '../city/schedule.ts';
import { generateCitations } from '../sample/citations.ts';
import { loadCitySource } from './sourcePanel.ts';

const source = loadCitySource('burbank');
const N = 3;
const csv = generateCitations({ seed: 5 }, source, { perType: N });
const result = importCitations(csv, source);

describe('rejects download', () => {
  const rows = parseCsv(rejectsToCsv(result.rejected));

  it('has a header and one line per rejected row', () => {
    expect(rows[0]).toEqual(['Row', 'Reason', 'Original row']);
    expect(rows).toHaveLength(1 + result.rejected.length);
    expect(result.rejected.length).toBe(2 * N);
  });

  it('holds each row number, reason and original cells', () => {
    result.rejected.forEach((r, i) => {
      const [row, reason, original] = rows[i + 1];
      expect(Number(row)).toBe(r.rowNumber);
      expect(reason).toBe(r.reason);
      expect(parseCsv(original)[0]).toEqual(r.raw);
    });
  });

  it('survives commas, quotes and ragged rows', () => {
    const out = parseCsv(rejectsToCsv([{ rowNumber: 7, raw: ['a,b', 'say "hi"'], reason: 'Bad, very "bad"' }]));
    expect(out[1].slice(0, 2)).toEqual(['7', 'Bad, very "bad"']);
    expect(parseCsv(out[1][2])[0]).toEqual(['a,b', 'say "hi"']);
  });

  it('is only a header when nothing was rejected', () => {
    expect(rejectsToCsv([])).toBe('Row,Reason,Original row\n');
  });
});

describe('summary counts', () => {
  it('total equals imported plus rejected', () => {
    const { total, imported, rejected } = result.counts;
    expect(total).toBe(imported + rejected);
    expect(total).toBe(csv.trimEnd().split('\n').length - 1);
  });

  it('counts flags across imported rows', () => {
    expect(Object.fromEntries(flagCounts(result))).toEqual({ 'Unknown citation code': N, 'Unmatched address': N });
  });

  it('groups unmatched addresses and their counts sum to the unmatched total', () => {
    const groups = unmatchedByAddress(result);
    expect(groups.reduce((s, [, c]) => s + c, 0)).toBe(result.counts.unmatched);
    expect(result.counts.unmatched).toBe(N);
  });
});
