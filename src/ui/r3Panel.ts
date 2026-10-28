import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildMatchIndex, type BlockInfo } from '../geo/matcher.ts';
import { setHotspotData } from '../map/hotspots.ts';
import type { FeatureCollection } from '../map/style.ts';
import { applyFilters, type CitationFilter } from '../reports/filters.ts';
import { blockCentroids, buildHotspots, hotspotFeatures, pinFeatures, type Hotspots } from '../reports/r3.ts';
import type { Citation, NamedLocation } from '../types.ts';

export interface R3Input {
  citations: Citation[];
  blocks: BlockInfo[];
  namedLocations: NamedLocation[];
  segments: FeatureCollection;
}

export const R3_NOTICE = 'Citations reflect enforcement activity, not violation rates.';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The R3 data for a day/hour selection; the map and the ranked list both read from it (G3, US-5). */
export function createR3State(input: () => R3Input | undefined) {
  const filter: CitationFilter = {};
  return {
    setDay(day: number | undefined) {
      filter.daysOfWeek = day === undefined ? undefined : [day];
    },
    setHour(hour: number | undefined) {
      filter.hours = hour === undefined ? undefined : [hour];
    },
    view(): { hotspots: Hotspots; map: { hotspots: FeatureCollection; pins: FeatureCollection } } | undefined {
      const i = input();
      if (!i) return undefined;
      const index = buildMatchIndex(i.blocks, i.namedLocations);
      const hotspots = buildHotspots(applyFilters(i.citations, filter), i.blocks, i.namedLocations, index, blockCentroids(i.segments));
      return { hotspots, map: { hotspots: hotspotFeatures(i.segments, hotspots.counts), pins: pinFeatures(hotspots.pins) } };
    },
  };
}

export function mountR3Panel(root: HTMLElement, map: MapLibreMap, input: () => R3Input | undefined): { refresh(): void } {
  const state = createR3State(input);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const select = (label: string, options: string[], onChange: (i: number | undefined) => void) => {
    const s = el('select');
    s.append(new Option('Any', ''), ...options.map((o, i) => new Option(o, String(i))));
    s.addEventListener('change', () => {
      onChange(s.value === '' ? undefined : Number(s.value));
      render();
    });
    const l = el('label', `${label} `);
    l.append(s);
    return l;
  };
  const controls = el('div');
  controls.append(
    select('Day', DAYS, state.setDay),
    ' ',
    select('Hour', Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), state.setHour),
  );
  const list = el('div');
  root.append(el('h2', 'R3 Block hotspots'), el('p', R3_NOTICE), controls, list);

  function render(): void {
    list.replaceChildren();
    const v = state.view();
    if (!v) {
      list.append(el('p', 'Load citation data to see block hotspots.'));
      return;
    }
    setHotspotData(map, v.map.hotspots, v.map.pins);
    const ol = el('ol');
    for (const r of v.hotspots.ranked.slice(0, 10)) ol.append(el('li', `${r.label}: ${r.count.toLocaleString()}`));
    list.append(ol);
    if (v.hotspots.unmatched > 0) list.append(el('p', `${v.hotspots.unmatched.toLocaleString()} citations have no matched block and are not on the map.`));
  }
  render();
  return { refresh: render };
}
