import { describe, expect, it } from 'vitest';
import { generateCitations } from './citations.ts';
import { importCitations } from '../import/citations.ts';
import { FLAG_UNKNOWN_CODE, FLAG_UNMATCHED_ADDRESS } from '../import/validate.ts';
import { loadCitySource } from '../ui/sourcePanel.ts';

const source = loadCitySource('burbank');
const N = 4;
const run = (seed: number) => {
  const csv = generateCitations({ seed }, source, { perType: N });
  return { csv, result: importCitations(csv, source) };
};

describe('error-injection mode (FR-4b)', () => {
  const { csv, result } = run(11);
  const clean = importCitations(generateCitations({ seed: 11 }, source), source);
  const rejectedWith = (text: string) => result.rejected.filter((r) => r.reason.includes(text));

  it('leaves the default output unchanged', () => {
    expect(csv.startsWith(generateCitations({ seed: 11 }, source).trimEnd())).toBe(true);
    expect(clean.counts).toMatchObject({ rejected: 0, unmatched: 0 });
  });

  it('is reproducible for a seed', () => {
    expect(run(11).csv).toBe(csv);
    expect(run(12).csv).not.toBe(csv);
  });

  it('rejects each injected duplicate ID and keeps the first row', () => {
    const dups = rejectedWith('Duplicate Citation ID');
    expect(dups).toHaveLength(N);
    for (const d of dups) expect(result.citations.filter((c) => c.id === d.raw[0])).toHaveLength(1);
  });

  it('rejects each injected bad date', () => {
    const bad = rejectedWith('Invalid date');
    expect(bad).toHaveLength(N);
    expect(bad.every((r) => r.raw[0].startsWith('E-DATE-'))).toBe(true);
  });

  it('flags each injected unknown code without rejecting it', () => {
    const flagged = result.citations.filter((c) => c.flags.includes(FLAG_UNKNOWN_CODE));
    expect(flagged.map((c) => c.id).sort()).toEqual([1, 2, 3, 4].map((i) => `E-CODE-${i}`));
  });

  it('lists each injected unmatched address and flags it', () => {
    expect(result.unmatched.map((u) => u.citationId).sort()).toEqual([1, 2, 3, 4].map((i) => `E-ADDR-${i}`));
    const flagged = result.citations.filter((c) => c.flags.includes(FLAG_UNMATCHED_ADDRESS));
    expect(flagged).toHaveLength(N);
  });

  it('accounts for every injected row and nothing else', () => {
    expect(result.rejected).toHaveLength(2 * N);
    expect(result.counts.total).toBe(clean.counts.total + 4 * N);
    expect(result.counts.imported + result.counts.rejected).toBe(result.counts.total);
  });
});
