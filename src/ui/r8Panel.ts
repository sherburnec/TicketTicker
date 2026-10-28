import type { Map as MapLibreMap } from 'maplibre-gl';
import { setPatrolData } from '../map/hotspots.ts';
import type { PatrolAggregate } from '../patrol/aggregate.ts';
import { buildR8, hasMotion, R8_INTERNAL_NOTICE, R8_NOTICE, type PatrolFilter, type R8View, type ScaleMode } from '../reports/r8.ts';

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

export function mountR8Panel(root: HTMLElement, map: MapLibreMap, input: () => PatrolAggregate | undefined): { refresh(): void } {
  const state = createR8State(input);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const n = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

  function render(): void {
    root.replaceChildren(el('h2', 'R8 Patrol heatmap'), el('p', R8_INTERNAL_NOTICE), el('p', R8_NOTICE));
    const v = state.view();
    if (!v) {
      root.append(el('p', 'Load patrol data to see the patrol heatmap.'));
      setPatrolData(map, { type: 'FeatureCollection', features: [] });
      return;
    }
    const { aggregate, view } = v;
    const f = state.filter();
    setPatrolData(map, view.features);

    const labelled = (text: string, control: HTMLElement) => {
      const l = el('label', `${text} `);
      l.append(control);
      return l;
    };
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
    root.append(labelled('From', date('dateFrom')), ' ', labelled('To', date('dateTo')), ' ', labelled('Day', day), ' ', labelled('Hour', hour), ' ', labelled('Vehicle', vehicle), ' ', labelled('Colour scale', scale));
    if (hasMotion(aggregate)) {
      const motion = el('select');
      motion.append(new Option('Any', ''), new Option('Moving', 'm'), new Option('Stopped', 's'));
      motion.value = f.motion ?? '';
      motion.addEventListener('change', () => {
        state.set({ motion: motion.value === '' ? undefined : (motion.value as 'm' | 's') });
        render();
      });
      root.append(' ', labelled('Motion', motion));
    }
    const reset = el('button', 'Clear filters');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      state.clear();
      render();
    });
    root.append(' ', reset);

    root.append(el('p', view.legend), el('p', `Total under the filter: ${n(view.total)} ${aggregate.unit}.`));

    root.append(el('h3', `Patrol ${aggregate.unit} by day and hour (select a cell to filter the map)`));
    const table = el('table');
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
        b.style.background = `rgba(44, 90, 160, ${view.dayHourMax > 0 ? value / view.dayHourMax : 0})`;
        b.addEventListener('click', () => {
          state.selectCell(d, h);
          render();
        });
        td.append(b);
        tr.append(td);
      }
      table.append(tr);
    });
    root.append(table);
  }

  render();
  return { refresh: render };
}
