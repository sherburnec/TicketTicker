import { describe, expect, it } from 'vitest';
import { detectFormat, readHeader, type PatrolFormat } from '../../src/patrol/formats.ts';
import { importPatrol, type PatrolCity } from '../../src/patrol/importer.ts';
import { generatePatrol } from '../../src/sample/patrol.ts';
import { loadCitySource, loadSegments } from '../../src/ui/sourcePanel.ts';

// FR-45: default-mode sample patrol data, run back through the importer, gives zero rejected rows and zero points
// outside the city extent, and points inside the depot zone are excluded. A failure here is a defect, not a data gap.
const source = loadCitySource('burbank');
const segments = loadSegments('burbank');
const city: PatrolCity = { settings: source.city, blocks: source.blocks, namedLocations: source.namedLocations, segments };

function roundTrip(months: number, format: PatrolFormat) {
  const csv = generatePatrol({ durationMonths: months, seed: 20260930 }, { city: source.city, segments }, format);
  const detected = detectFormat(readHeader(csv));
  expect(detected.format).toBe(format);
  expect(detected.missing).toEqual([]);
  return importPatrol({ csv, format, columns: detected.mapping, timeZone: source.city.timeZone, city });
}

// Format A is point-level (about 5,000 rows a day), so the longest run is kept to a size a test can hold in memory;
// volume at multi-year scale is Phase 8's job.
describe.each([
  { format: 'A' as const, months: 1 },
  { format: 'A' as const, months: 6 },
  { format: 'B' as const, months: 1 },
  { format: 'B' as const, months: 36 },
])('FR-45 round trip, Format $format, $months months, seeded', ({ format, months }) => {
  const result = roundTrip(months, format);

  it('produces a realistic volume', () => {
    expect(result.summary.counts.read).toBeGreaterThan(months * (format === 'A' ? 20 * 3000 : 20 * 10));
  });

  it('rejects no rows', () => {
    expect(result.rejected).toEqual([]);
  });

  it('puts no point outside the city extent', () => {
    expect(result.excluded['Outside city extent']).toBe(0);
  });

  it('excludes points inside the depot zone, and nothing else', () => {
    expect(result.excluded['Inside depot zone']).toBeGreaterThan(0);
    expect(result.excluded['Inside exclusion zone']).toBe(0);
  });

  it('ignores no duplicates, places every Format B stop, and keeps only an aggregate', () => {
    expect(result.summary.counts.duplicates).toBe(0);
    expect(result.summary.unmatchedStops).toBe(0);
    expect(result.aggregate.cells.size).toBeGreaterThan(0);
    expect(result.summary.vehicleCount).toBe(4);
    expect(result.summary.dateRange).toBeDefined();
  });
});
