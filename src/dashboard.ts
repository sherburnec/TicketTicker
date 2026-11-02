import { bundledCityFiles, loadCitySource, loadSegments, mountSourcePanel, type CityFileSet } from './ui/sourcePanel.ts';
import { importCitationsInWorker, type ImportResult } from './import/citations.ts';
import { renderImportSummary } from './ui/importSummary.ts';
import { mountRatesPanel } from './ui/ratesPanel.ts';
import { applyMapTheme, mountStreetMap } from './map/streetMap.ts';
import { mountR3Panel } from './ui/r3Panel.ts';
import { mountR4Panel } from './ui/r4Panel.ts';
import { mountOfficerPanel } from './ui/officerPanel.ts';
import { detectFormat, readHeader, type ColumnMapping, type PatrolFormat } from './patrol/formats.ts';
import { importPatrolInWorker } from './patrol/importer.ts';
import { mountR8Panel } from './ui/r8Panel.ts';
import type { PatrolAggregate } from './patrol/aggregate.ts';
import { renderPatrolSummary } from './ui/patrolSummary.ts';
import { mountColumnMapper } from './ui/columnMapper.ts';
import { createPatrolStore, mountPatrolSourcePanel, samplePatrol } from './ui/patrolSource.ts';
import { mountExportPanel } from './ui/exportPanel.ts';
import { buildCityReportModel } from './pdf/cityReport.ts';
import { asOfDate } from './revenue/schedule.ts';
import type { createTheme } from './ui/theme.ts';
import { mountShell } from './ui/shell.ts';
import { el, emptyState, heading, notice } from './ui/dom.ts';
import { citationMapLegend } from './ui/mapLegend.ts';

/** Replaces `root` with a labelled progress bar. */
function showProgress(root: HTMLElement, label: string, done: number, total: number): void {
  const bar = el('progress');
  bar.max = total;
  bar.value = done;
  bar.setAttribute('aria-label', label);
  root.replaceChildren(el('p', `${label} ${Math.round((done / Math.max(total, 1)) * 100)}%`, 'muted'), bar);
}

/** What `mountDashboard` returns. `destroy` removes the dashboard's DOM, maps, workers and listeners. */
export interface Dashboard {
  destroy(): void;
  /** True when citations, patrol data or rate changes are loaded, so a city switch must confirm (AS9). */
  hasData(): boolean;
}

/** Mounts the dashboard for one city into `app`. All state is in memory and is dropped on `destroy` (NFR-1, AS9). */
export function mountDashboard(app: HTMLElement, cityId: string, theme: ReturnType<typeof createTheme>, opts: { files?: CityFileSet; cityControl?: HTMLElement } = {}): Dashboard {
  const files = opts.files ?? bundledCityFiles;
  const source = loadCitySource(cityId, files);
  const segments = loadSegments(cityId, files);
  const work = new AbortController();
  let destroyed = false;


  // Maps are created before the shell so the shell can resize them when a hidden view is shown.
  const maps: ReturnType<typeof mountStreetMap>[] = [];
  const shell = mountShell(app, source.city.name, theme, () => requestAnimationFrame(() => destroyed || maps.forEach((m) => m.resize())), opts.cityControl);
  const s = shell.sections;

  const panel = el('div');
  const loaded = el('div', undefined, 'load-status');
  loaded.append(emptyState('No citation data loaded. Choose a source and select Load.'));
  const summary = el('div');
  const rates = el('div');
  const hotspots = el('div');
  const map = el('div', undefined, 'map-frame');
  const locations = el('div');
  const officers = el('div');
  const exportRoot = el('div');

  const hotspotsLayout = el('div', undefined, 'split');
  const mapColumn = el('div', undefined, 'map-column');
  mapColumn.append(map, citationMapLegend());
  hotspotsLayout.append(hotspots, mapColumn);

  s['citation-data'].append(heading('Load citation data'), panel);
  s['import-summary'].append(loaded, summary);
  s['revenue'].append(rates);
  s['hotspots'].append(hotspotsLayout);
  s['officers'].append(officers);
  s['locations'].append(locations);
  s['city-pdf'].append(exportRoot);

  // Patrol sits in its own view (FR-28, RPT-11).
  const patrolPanel = el('div');
  const patrolFormat = el('div');
  const patrolSummary = el('div');
  const r8Root = el('div');
  const patrolMap = el('div', undefined, 'map-frame');
  s['patrol-data'].append(heading('Load patrol data'), notice('Internal only: patrol data is never included in the city PDF.'), patrolPanel);
  s['patrol-import'].append(patrolFormat, patrolSummary);
  s['patrol-heatmap'].append(r8Root);

  // In-memory only for the session (NFR-1).
  let citations: ImportResult | undefined;
  const streetMap = mountStreetMap(map, source.city, segments);
  const patrolStreetMap = mountStreetMap(patrolMap, source.city, segments);
  maps.push(streetMap, patrolStreetMap);
  const unsubscribeTheme = theme.subscribe((t) => maps.forEach((m) => applyMapTheme(m, t)));

  const ratesPanel = mountRatesPanel(rates, () => citations && { citations: citations.citations, ctx: { schedule: source.schedule, city: source.city } }, () => exportPanel.refresh());
  const exportPanel = mountExportPanel(exportRoot, () => {
    const asOf = citations && asOfDate(citations.citations, ratesPanel.settings().asOf);
    if (!citations || !asOf) return undefined;
    return buildCityReportModel(source.city.name, citations.citations, source.blocks, source.namedLocations, { schedule: source.schedule, city: source.city }, asOf, ratesPanel.settings().overrides);
  });
  const r3 = mountR3Panel(hotspots, streetMap, () => citations && { citations: citations.citations, blocks: source.blocks, namedLocations: source.namedLocations, segments });
  const r4 = mountR4Panel(locations, () => citations && { citations: citations.citations, namedLocations: source.namedLocations });
  const r56 = mountOfficerPanel(officers, streetMap, () => citations && { citations: citations.citations, segments });

  // Patrol data is held apart from citations; loading it never re-imports them (FR-28).
  const patrol = createPatrolStore();
  // The patrol aggregate lives apart from citations and feeds R8 only (FR-28, RPT-11).
  let patrolAggregate: PatrolAggregate | undefined;
  const r8 = mountR8Panel(r8Root, patrolStreetMap, () => patrolAggregate, patrolMap);
  const patrolSource = { city: source.city, segments };
  mountPatrolSourcePanel(patrolPanel, patrol, source.city.timeZone, () => {
    patrolFormat.replaceChildren();
    patrolSummary.replaceChildren();
    patrolAggregate = undefined;
    r8.refresh();
    const data = patrol.get();
    shell.setStatus('patrol', data ? data.label : 'Nothing loaded');
    if (!data) return;
    const headers = readHeader(data.csv);
    const found = detectFormat(headers);
    const done = async (format: PatrolFormat, columns: ColumnMapping) => {
      patrolFormat.replaceChildren(el('p', `Detected Format ${format}${found.missing.length ? ' (columns mapped by you)' : ''}.`, 'muted'));
      try {
        const result = await importPatrolInWorker({
          csv: data.csv, format, columns, timeZone: data.timeZone ?? source.city.timeZone,
          city: { settings: source.city, blocks: source.blocks, namedLocations: source.namedLocations, segments: format === 'B' ? segments : undefined },
        }, (d, t) => showProgress(patrolSummary, 'Importing patrol data', d, t), work.signal);
        renderPatrolSummary(patrolSummary, result);
        patrolAggregate = result.aggregate;
        r8.refresh();
      } catch (e) {
        if (destroyed) return;
        patrolSummary.replaceChildren(notice(e instanceof Error ? e.message : String(e), 'error'));
      }
    };
    if (found.missing.length === 0) done(found.format, found.mapping);
    else mountColumnMapper(patrolFormat, headers, found.format, done);
  }, (o) => samplePatrol(patrolSource, o));

  mountSourcePanel(panel, source, async (data) => {
    try {
      citations = await importCitationsInWorker(data.csv, source, (done, total) => {
        showProgress(loaded, `Importing ${done.toLocaleString()} of ${total.toLocaleString()} rows`, done, total);
      }, work.signal);
      loaded.replaceChildren(el('p', data.label, 'source-label'));
      shell.setStatus('citations', `${data.label}: ${citations.counts.imported.toLocaleString()} citations`);
      renderImportSummary(summary, citations);
      ratesPanel.refresh();
      r3.refresh();
      r4.refresh();
      r56.refresh();
      exportPanel.refresh();
    } catch (e) {
      if (destroyed) return;
      loaded.replaceChildren(notice(e instanceof Error ? e.message : String(e), 'error'));
    }
  });

  shell.show('citations');

  return {
    hasData() {
      const { asOf, overrides } = ratesPanel.settings();
      return citations !== undefined || patrol.get() !== undefined || asOf !== undefined || Object.keys(overrides).length > 0;
    },
    destroy() {
      destroyed = true;
      work.abort();
      unsubscribeTheme();
      maps.forEach((m) => m.remove());
      maps.length = 0;
      shell.destroy();
    },
  };
}
