import { describe, expect, it } from 'vitest';
import { buildCityPdf, buildCityReportModel } from './cityReport.ts';
import { importCitations } from '../import/citations.ts';
import { generateCitations } from '../sample/citations.ts';
import { loadCitySource } from '../ui/sourcePanel.ts';
import { csvFileName, pdfFileName } from '../ui/filenames.ts';
import { pdfText } from '../../tests/helpers/pdfText.ts';

const fixtureText = import.meta.glob('/tests/fixtures/cities/*/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const fixtureCities = import.meta.glob('/tests/fixtures/cities/*/city.json', { eager: true, import: 'default' });
const files = { text: fixtureText, cities: fixtureCities };

const cities = [
  { id: 'burbank', files: undefined },
  { id: 'testville', files },
];

describe('city-scoped PDF', () => {
  it.each(cities)('$id: the PDF names only its own city and no officer or patrol content', async ({ id, files }) => {
    const source = loadCitySource(id, files);
    const result = importCitations(generateCitations({ durationMonths: 1, seed: 'scope' }, source), source);
    const model = buildCityReportModel(source.city, result.citations, source.blocks, source.namedLocations, { schedule: source.schedule, city: source.city }, '2025-03-10');
    expect(model.cityName).toBe(source.city.name);
    const text = pdfText(new Uint8Array(await (await buildCityPdf(model)).arrayBuffer()));
    expect(text).toContain(source.city.name);
    for (const other of cities.filter((c) => c.id !== id)) {
      const name = loadCitySource(other.id, other.files).city.name;
      expect(text).not.toContain(name.split(',')[0]);
    }
    for (const word of ['officer', 'patrol', 'samsara']) expect(text.toLowerCase()).not.toContain(word);
    // The code table lists only this city's own schedule codes.
    const own = new Set(source.schedule.map((e) => e.code));
    for (const row of model.typeMix) expect(own.has(row.code), row.code).toBe(true);
  });
});

describe('file names', () => {
  it('carry the city id', () => {
    expect(pdfFileName('malibu', '2025-03-10')).toBe('malibu-citation-report-2025-03-10.pdf');
    expect(csvFileName('malibu', 'rejected-rows')).toBe('malibu-rejected-rows.csv');
    expect(csvFileName('malibu', 'patrol-sample')).toBe('malibu-patrol-sample.csv');
  });
});
