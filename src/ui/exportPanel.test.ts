import { describe, expect, it } from 'vitest';
import type { CityReportModel } from '../pdf/cityReport.ts';
import { createExportState, previewLines } from './exportPanel.ts';

const model: CityReportModel = {
  cityName: 'Burbank', asOf: '2025-03-10', citationCount: 4, realized: 100,
  projected: { avg: 40, low: null, high: null, rangeNotice: 'Range hidden: test.' },
  pending: { count: 1, amount: 50 }, outstanding: { count: 1, expected: 80 },
  rates: [{ name: 'Collection rate', computed: '50.0%', applied: '60.0%', status: 'Manually set' }],
  warnings: [], typeMix: [], monthly: [], blocks: [], namedLocations: [],
};

describe('export confirmation', () => {
  it('is disabled until the confirmation is checked, and without data', async () => {
    let data: CityReportModel | undefined = model;
    const s = createExportState(() => data);
    expect(s.canExport()).toBe(false);
    expect(await s.exportPdf()).toBeUndefined();
    s.setConfirmed(true);
    expect(s.canExport()).toBe(true);
    expect((await s.exportPdf())?.type).toBe('application/pdf');
    s.setConfirmed(false);
    expect(s.canExport()).toBe(false);
    s.setConfirmed(true);
    data = undefined;
    expect(s.canExport()).toBe(false);
  });

  it('previews the as-of date and each rate with its status', () => {
    const text = previewLines(model).join('\n');
    expect(text).toContain('as of 2025-03-10');
    expect(text).toContain('Collection rate: 60.0% (Manually set; computed 50.0%)');
    expect(text).toContain('Range hidden: test.');
  });
});
