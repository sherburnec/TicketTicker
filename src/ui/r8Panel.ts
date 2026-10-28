import type { Map as MapLibreMap } from 'maplibre-gl';
import { setPatrolData } from '../map/hotspots.ts';
import type { PatrolAggregate } from '../patrol/aggregate.ts';
import { buildR8, hasMotion, R8_INTERNAL_NOTICE, R8_NOTICE, type PatrolFilter, type R8View, type ScaleMode } from '../reports/r8.ts';
import { el, emptyState, field, heading, notice } from './dom.ts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Filter and scale state for R8. Every change rebuilds the view from the aggregate (RPT-8, RPT-10). */
export function createR8State(input: () => PatrolAggregate | undefined) {
  let filter: PatrolFilter = {};
  let scale: ScaleMode = 'relative';
  return {
    set(change: Partial<PatrolFilter>): void {
      filter = { ...filter, ...change };
    },
    clear(): void {
      filter = {};
    },
    setScale(mode: ScaleMode): void {
      scale = mode;
    },
    /** Applies one day and hour from the day-by-hour summary to the map (RPT-10). */
    selectCell(day: number, hour: number): void {
      filter = { ...filter, days: [day], hours: [hour] };
    },
    filter: (): PatrolFilter => filter,
    view(): { aggregate: PatrolAggregate; view: R8View } | undefined {
      const aggregate = input();
      return aggregate && { aggregate, view: buildR8(aggregate, filter, scale) };
    },
  };
}

export function mountR8Panel(root: HTMLElement, map: MapLibreMap, input: () => PatrolAggregate | undefined, mapSlot?: HTMLElement): { refresh(): void } {
  const state = createR8State(input);
  const n = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

  function render(): void {
    root.replaceChildren(heading('Patrol heatmap', 'R8'), notice(R8_INTERNAL_NOTICE), notice(R8_NOTICE));
    if (mapSlot) root.append(mapSlot);
    const v = state.view();
    if (!v) {
      root.append(emptyState('Load patrol data to see the patrol heatmap.'));
      setPatrolData(map, { type: 'FeatureCollection', features: [] });
      return;
    }
    const { aggregate, view } = v;
    const f = state.filter();
    setPatrolData(map, view.features);

    const labelled = field;
    const date = (key: 'dateFrom' | 'dateTo') => {
      const i = el('input');
      i.type = 'date';
      i.value = f[key] ?? '';
      i.addEventListener('change', () => {
        state.set({ [key]: i.value || undefined });
        render();
      });
      return i;
    };
    const day = el('select');
    day.append(new Option('Any', ''), ...DAYS.map((d, i) => new Option(d, String(i))));
    day.value = f.days?.length === 1 ? String(f.days[0]) : '';
    day.addEventListener('change', () => {
      state.set({ days: day.value === '' ? undefined : [Number(day.value)] });
      render();
    });
    const hour = el('select');
    hour.append(new Option('Any', ''), ...Array.from({ length: 24 }, (_, h) => new Option(`${String(h).padStart(2, '0')}:00`, String(h))));
    hour.value = f.hours?.length === 1 ? String(f.hours[0]) : '';
    hour.addEventListener('change', () => {
      state.set({ hours: hour.value === '' ? undefined : [Number(hour.value)] });
      render();
    });
    const vehicle = el('select');
    vehicle.append(new Option('All', ''), ...aggregate.vehicles.map((name, i) => new Option(name, String(i))));
    vehicle.value = f.vehicle === undefined ? '' : String(f.vehicle);
    vehicle.addEventListener('change', () => {
      state.set({ vehicle: vehicle.value === '' ? undefined : Number(vehicle.value) });
      render();
    });
    const scale = el('select');
    scale.append(new Option('Relative to current filter', 'relative'), new Option('Fixed to whole data set', 'fixed'));
    scale.addEventListener('change', () => {
      state.setScale(scale.value as ScaleMode);
      render();
    });
    const controls = el('div', undefined, 'controls');
    controls.append(labelled('From', date('dateFrom')), labelled('To', date('dateTo')), labelled('Day', day), labelled('Hour', hour), labelled('Vehicle', vehicle), labelled('Colour scale', scale));
    root.append(controls);
    if (hasMotion(aggregate)) {
      const motion = el('select');
      motion.append(new Option('Any', ''), new Option('Moving', 'm'), new Option('Stopped', 's'));
      motion.value = f.motion ?? '';
      motion.addEventListener('change', () => {
        state.set({ motion: motion.value === '' ? undefined : (motion.value as 'm' | 's') });
        render();
      });
      controls.append(labelled('Motion', motion));
    }
    const reset = el('button', 'Clear filters');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      state.clear();
      render();
    });
    controls.append(reset);

    const legend = el('div', undefined, 'legend');
    const ramp = el('span', undefined, 'legend-ramp');
    ramp.style.background = 'linear-gradient(90deg, #cfe3f5, #5b9bd5, #2c5aa0, #1b2a6b)';
    ramp.setAttribute('aria-hidden', 'true');
    legend.append(ramp, el('span', view.legend));
    root.append(legend, el('p', `Total under the filter: ${n(view.total)} ${aggregate.unit}.`, 'lead'));

    root.append(heading(`Patrol ${aggregate.unit} by day and hour (select a cell to filter the map)`, undefined, 'h3'));
    const table = el('table', undefined, 'heat-table');
    const head = el('tr');
    head.append(el('th', ''));
    for (let h = 0; h < 24; h++) head.append(el('th', String(h)));
    table.append(head);
    DAYS.forEach((name, d) => {
      const tr = el('tr');
      tr.append(el('th', name));
      for (let h = 0; h < 24; h++) {
        const td = el('td');
        const value = view.dayHour[d][h];
        const b = el('button', value === 0 ? '' : n(value));
        b.type = 'button';
        b.setAttribute('aria-label', `${name} ${h}:00, ${n(value)} ${aggregate.unit}`);
        const ratio = view.dayHourMax > 0 ? value / view.dayHourMax : 0;
        b.className = ratio > 0.5 ? 'heat-cell heat-high' : 'heat-cell';
        b.style.setProperty('--heat', String(ratio));
        b.addEventListener('click', () => {
          state.selectCell(d, h);
          render();
        });
        td.append(b);
        tr.append(td);
      }
      table.append(tr);
    });
    const scroll = el('div', undefined, 'table-scroll');
    scroll.append(table);
    root.append(scroll);
  }

  render();
  return { refresh: render };
}
