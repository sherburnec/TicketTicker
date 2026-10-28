import { describe, expect, it } from 'vitest';
import { loadCitySource, sampleCitations, uploadedCitations } from './sourcePanel.ts';
import { CITATION_HEADERS } from '../sample/citations.ts';

describe('source panel data sources', () => {
  const source = loadCitySource('burbank');

  it('loads the Burbank folder for the generator', () => {
    expect(source.city.id).toBe('burbank');
    expect(source.blocks.length).toBeGreaterThan(0);
    expect(source.schedule.length).toBeGreaterThan(0);
    expect(() => loadCitySource('nowhere')).toThrow();
  });

  it('loads sample data, reproducibly for a seed', () => {
    const a = sampleCitations(source, 1, '7');
    expect(a.csv.split('\n')[0]).toBe(CITATION_HEADERS.join(','));
    expect(a.csv.split('\n').length).toBeGreaterThan(1000);
    expect(sampleCitations(source, 1, '7').csv).toBe(a.csv);
    expect(a.label).toContain('seed 7');
  });

  it('rejects an invalid sample duration', () => {
    expect(() => sampleCitations(source, 0)).toThrow();
    expect(() => sampleCitations(source, 1.5)).toThrow();
  });

  it('loads an uploaded CSV as-is', async () => {
    const text = `${CITATION_HEADERS.join(',')}\nC1,2026-01-01\n`;
    const data = await uploadedCitations(new File([text], 'cites.csv', { type: 'text/csv' }));
    expect(data).toEqual({ csv: text, label: 'Upload: cites.csv' });
  });

  it('rejects an empty upload', async () => {
    await expect(uploadedCitations(new File(['  \n'], 'empty.csv'))).rejects.toThrow('empty');
  });
});
