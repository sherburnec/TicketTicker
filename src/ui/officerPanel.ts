import type { Map as MapLibreMap } from 'maplibre-gl';
import { setCoverageData } from '../map/hotspots.ts';
import type { FeatureCollection } from '../map/style.ts';
import { buildCoverage, R5_PROXY_LABEL, type Coverage } from '../reports/r5.ts';
import { buildOfficerActivity, type OfficerRow } from '../reports/r6.ts';
import { hotspotFeatures } from '../reports/r3.ts';
import type { Citation } from '../types.ts';
import { el, emptyState, field, heading, notice } from './dom.ts';

export interface OfficerInput {
  citations: Citation[];
  segments: FeatureCollection;
}

/** FR-25: location and staffing reports say citations reflect enforcement activity, not violation rates. */
export const OFFICER_NOTICE = 'Citations reflect enforcement activity, not violation rates.';
export const INTERNAL_NOTICE = 'Internal only: officer data is never included in the city PDF.';

/** R5 and R6 data for an officer and hour selection. */
export function createOfficerState(input: () => OfficerInput | undefined) {
  let officer: string | undefined;
  let hour: number | undefined;
  return {
    setOfficer(o: string | undefined) {
      officer = o;
    },
    setHour(h: number | undefined) {
      hour = h;
    },
    view(): { coverage: Coverage; activity: OfficerRow[]; map: FeatureCollection } | undefined {
      const i = input();
      if (!i) return undefined;
      const coverage = buildCoverage(i.citations, officer, hour === undefined ? [] : [hour]);
      return { coverage, activity: buildOfficerActivity(i.citations), map: hotspotFeatures(i.segments, coverage.footprint) };
    },
  };
}

export function mountOfficerPanel(root: HTMLElement, map: MapLibreMap, input: () => OfficerInput | undefined): { refresh(): void } {
  const state = createOfficerState(input);
  const officerSelect = el('select');
  const hourSelect = el('select');
  hourSelect.append(new Option('Any', ''), ...Array.from({ length: 24 }, (_, h) => new Option(`${String(h).padStart(2, '0')}:00`, String(h))));
  officerSelect.addEventListener('change', () => {
    state.setOfficer(officerSelect.value === '' ? undefined : officerSelect.value);
    render();
  });
  hourSelect.addEventListener('change', () => {
    state.setHour(hourSelect.value === '' ? undefined : Number(hourSelect.value));
    render();
  });

  const body = el('div');
  root.append(heading('Officer activity', 'R5, R6'), notice(INTERNAL_NOTICE), notice(OFFICER_NOTICE), notice(R5_PROXY_LABEL));
  const controls = el('div', undefined, 'controls');
  controls.append(field('Officer', officerSelect), field('Hour', hourSelect));
  root.append(controls, body);

  function render(): void {
    body.replaceChildren();
    const v = state.view();
    if (!v) {
      body.append(emptyState('Load citation data to see officer activity.'));
      setCoverageData(map, { type: 'FeatureCollection', features: [] });
      return;
    }
    const keep = officerSelect.value;
    officerSelect.replaceChildren(new Option('None', ''), ...v.coverage.officers.map((o) => new Option(o, o)));
    if (v.coverage.officers.includes(keep)) officerSelect.value = keep;
    setCoverageData(map, v.map);

    const table = el('table');
    const head = el('tr');
    for (const h of ['Officer', 'Citations', 'Paid', 'Unpaid', 'Pending', 'Reversed']) head.append(el('th', h));
    table.append(head);
    for (const r of v.activity) {
      const tr = el('tr');
      for (const c of [r.officer, r.total, r.byResult.Paid, r.byResult.Unpaid, r.byResult.Pending, r.byResult.Reversed]) tr.append(el('td', String(c)));
      table.append(tr);
    }
    body.append(heading('Citations by officer', 'R6', 'h3'), table);
    if (officerSelect.value !== '') body.append(el('p', `R5: ${v.coverage.footprint.size} blocks shown in teal on the map for officer ${officerSelect.value}. See the map under Busiest blocks.`, 'muted'));
  }
  render();
  return { refresh: render };
}
