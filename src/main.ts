import { loadCitySource, loadSegments, mountSourcePanel } from './ui/sourcePanel.ts';
import { importCitationsInWorker, type ImportResult } from './import/citations.ts';
import { renderImportSummary } from './ui/importSummary.ts';
import { mountRatesPanel } from './ui/ratesPanel.ts';
import { mountStreetMap } from './map/streetMap.ts';
import { mountR3Panel } from './ui/r3Panel.ts';
import { mountR4Panel } from './ui/r4Panel.ts';
import { mountOfficerPanel } from './ui/officerPanel.ts';
import { detectFormat, readHeader, type ColumnMapping, type PatrolFormat } from './patrol/formats.ts';
import { importPatrolInWorker } from './patrol/importer.ts';
import { renderPatrolSummary } from './ui/patrolSummary.ts';
import { mountColumnMapper } from './ui/columnMapper.ts';
import { createPatrolStore, mountPatrolSourcePanel } from './ui/patrolSource.ts';
import { mountExportPanel } from './ui/exportPanel.ts';
import { buildCityReportModel } from './pdf/cityReport.ts';
import { asOfDate } from './revenue/schedule.ts';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Citation Insights';
  const panel = document.createElement('div');
  const patrolPanel = document.createElement('div');
  const patrolFormat = document.createElement('div');
  const patrolSummary = document.createElement('div');
  const loaded = document.createElement('p');
  loaded.textContent = 'No citation data loaded.';
  const summary = document.createElement('div');
  const rates = document.createElement('div');
  const hotspots = document.createElement('div');
  const locations = document.createElement('div');
  const officers = document.createElement('div');
  const exportRoot = document.createElement('div');
  const map = document.createElement('div');
  map.style.cssText = 'height:480px;margin:1em 0';
  app.append(title, panel, patrolPanel, patrolFormat, patrolSummary, loaded, summary, rates, hotspots, map, locations, officers, exportRoot);

  // In-memory only for the session (NFR-1).
  let citations: ImportResult | undefined;
  const source = loadCitySource('burbank');
  const segments = loadSegments('burbank');
  const streetMap = mountStreetMap(map, source.city, segments);
  const ratesPanel = mountRatesPanel(rates, () => citations && { citations: citations.citations, ctx: { schedule: source.schedule, city: source.city } }, () => exportPanel.refresh());
  const exportPanel = mountExportPanel(exportRoot, () => {
    const asOf = citations && asOfDate(citations.citations, ratesPanel.settings().asOf);
    if (!citations || !asOf) return undefined;
    return buildCityReportModel(source.city.name, citations.citations, source.blocks, source.namedLocations, { schedule: source.schedule, city: source.city }, asOf, ratesPanel.settings().overrides);
  });
  const r3 = mountR3Panel(hotspots, streetMap, () => citations && { citations: citations.citations, blocks: source.blocks, namedLocations: source.namedLocations, segments });
  const r4 = mountR4Panel(locations, () => citations && { citations: citations.citations, namedLocations: source.namedLocations });
  const r56 = mountOfficerPanel(officers, streetMap, () => citations && { citations: citations.citations, segments });
  // Patrol data is held apart from citations; loading it never re-imports them (FR-28). Parsing arrives in 7.3; later tasks add the aggregate.
  const patrol = createPatrolStore();
  mountPatrolSourcePanel(patrolPanel, patrol, source.city.timeZone, () => {
    patrolFormat.replaceChildren();
    patrolSummary.replaceChildren();
    const data = patrol.get();
    if (!data) return;
    const headers = readHeader(data.csv);
    const found = detectFormat(headers);
    const done = async (format: PatrolFormat, columns: ColumnMapping) => {
      patrolFormat.textContent = `Detected Format ${format}${found.missing.length ? ' (columns mapped by you)' : ''}.`;
      try {
        const result = await importPatrolInWorker({
          csv: data.csv, format, columns, timeZone: data.timeZone ?? source.city.timeZone,
          city: { settings: source.city, blocks: source.blocks, namedLocations: source.namedLocations, segments: format === 'B' ? segments : undefined },
        }, (d, t) => {
          patrolSummary.textContent = `Importing patrol data: ${Math.round((d / t) * 100)}%`;
        });
        renderPatrolSummary(patrolSummary, result);
      } catch (e) {
        patrolSummary.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    if (found.missing.length === 0) done(found.format, found.mapping);
    else mountColumnMapper(patrolFormat, headers, found.format, done);
  });
  mountSourcePanel(panel, source, async (data) => {
    try {
      citations = await importCitationsInWorker(data.csv, source, (done, total) => {
        loaded.textContent = `Importing ${done.toLocaleString()} of ${total.toLocaleString()} rows…`;
      });
      loaded.textContent = data.label;
      renderImportSummary(summary, citations);
      ratesPanel.refresh();
      r3.refresh();
      r4.refresh();
      r56.refresh();
      exportPanel.refresh();
    } catch (e) {
      loaded.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
