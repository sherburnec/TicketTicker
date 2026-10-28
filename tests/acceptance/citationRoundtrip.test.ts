import { describe, expect, it } from 'vitest';
import { generateCitations } from '../../src/sample/citations.ts';
import { importCitations } from '../../src/import/citations.ts';
import { loadCitySource } from '../../src/ui/sourcePanel.ts';

// FR-4a: sample data of any supported duration, run back through the importer and matcher, gives zero rejected rows and
// zero unmatched addresses. A failure here is a defect, not a data gap.
const source = loadCitySource('burbank');

describe.each([
  { name: '1 month', months: 1 },
  { name: '3 years', months: 36 },
])('FR-4a round trip, $name, seeded', ({ months }) => {
  const csv = generateCitations({ durationMonths: months, seed: 20260930 }, source);
  const result = importCitations(csv, source);

  it('produces a realistic volume', () => {
    expect(result.counts.total).toBeGreaterThan(months * 25 * 150);
  });

  it('rejects no rows', () => {
    expect(result.rejected).toEqual([]);
  });

  it('leaves no address unmatched', () => {
    expect(result.unmatched).toEqual([]);
  });

  it('imports every row, with no flags', () => {
    expect(result.counts.imported).toBe(result.counts.total);
    expect(result.citations.filter((c) => c.flags.length > 0)).toEqual([]);
  });
});
