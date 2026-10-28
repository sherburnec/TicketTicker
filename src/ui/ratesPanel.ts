import { project, type Projection } from '../revenue/projection.ts';
import type { RateContext, RateOverrides } from '../revenue/rates.ts';
import { asOfDate } from '../revenue/schedule.ts';
import type { Citation } from '../types.ts';
import { el, emptyState, field, heading, notice } from './dom.ts';

export interface RatesInput {
  citations: Citation[];
  ctx: RateContext;
}

export interface RateRow {
  name: string;
  computed: string;
  applied: string;
  status: 'Computed' | 'Manually set';
  /** Key for the override input; the reversal rate is context only and cannot be overridden (FR-20, §10). */
  override?: keyof RateOverrides;
}

export interface RatesView {
  asOf: string;
  projection: Projection;
  rows: RateRow[];
}

const pct = (r: number | null) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function rateRows(p: Projection): RateRow[] {
  const row = (name: string, r: Projection['rates']['collection'], override?: keyof RateOverrides): RateRow => ({
    name,
    computed: pct(r.computed),
    applied: pct(r.applied),
    status: r.status,
    override,
  });
  return [
    row('Collection rate', p.rates.collection, 'collection'),
    row('Escalation rate', p.rates.escalation, 'escalation'),
    row('Reversal rate', p.rates.reversal),
  ];
}

/** Override and as-of state for the rates panel. Every change recomputes from the loaded citations (FR-16, FR-20). */
export function createRatesState(input: () => RatesInput | undefined) {
  let overrides: RateOverrides = {};
  let asOfOverride: string | undefined;

  return {
    /** `fraction` is 0 to 1; anything else is ignored and false is returned. */
    setOverride(key: keyof RateOverrides, fraction: number): boolean {
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return false;
      overrides = { ...overrides, [key]: fraction };
      return true;
    },
    clearOverride(key: keyof RateOverrides): void {
      const { [key]: _removed, ...rest } = overrides;
      overrides = rest;
    },
    setAsOf(iso: string | undefined): void {
      asOfOverride = iso || undefined;
    },
    /** The as-of override and rate overrides now in force, so an export matches what the panel shows. */
    settings(): { asOf?: string; overrides: RateOverrides } {
      return { asOf: asOfOverride, overrides };
    },
    view(): RatesView | undefined {
      const data = input();
      const asOf = data && asOfDate(data.citations, asOfOverride);
      if (!data || !asOf) return undefined;
      const projection = project(data.citations, data.ctx, asOf, overrides);
      return { asOf, projection, rows: rateRows(projection) };
    },
  };
}

/** Rates and projections with computed and applied values, override inputs and an as-of date. Call `refresh` after new data loads. */
export function mountRatesPanel(root: HTMLElement, input: () => RatesInput | undefined, onChange?: () => void): { refresh(): void; settings(): { asOf?: string; overrides: RateOverrides } } {
  const state = createRatesState(input);

  function render(): void {
    root.replaceChildren();
    const v = state.view();
    if (!v) {
      root.append(heading('Revenue and rates'), emptyState('Load citation data to see rates and projections.'));
      return;
    }
    const { projection: p } = v;
    root.append(heading('Revenue and rates'));

    const asOf = el('input');
    asOf.type = 'date';
    asOf.value = v.asOf;
    asOf.addEventListener('change', () => {
      state.setAsOf(asOf.value);
      render();
      onChange?.();
    });
    root.append(field('As-of date', asOf));

    const range =
      p.projected.low !== null && p.projected.high !== null
        ? `Range ${money(p.projected.low)} to ${money(p.projected.high)}`
        : (p.projected.rangeNotice ?? '');
    const figures = el('dl', undefined, 'figures');
    const figure = (label: string, value: string, note: string, kind: string) => {
      const wrap = el('div', undefined, `figure figure-${kind}`);
      wrap.append(el('dt', label), el('dd', value));
      if (note) wrap.append(el('dd', note, 'figure-note'));
      figures.append(wrap);
    };
    figure('Realized', money(p.realized.amount), 'Collected so far', 'fact');
    figure('Projected (average)', money(p.projected.avg), range, 'estimate');
    figure('Pending, not in projections', money(p.pending.amount), `${p.pending.count.toLocaleString()} citations`, 'neutral');
    root.append(figures);

    const table = el('table');
    const head = el('tr');
    for (const h of ['Rate', 'Computed', 'Applied', 'Status', 'Override (%)']) head.append(el('th', h));
    table.append(head);
    for (const r of v.rows) {
      const tr = el('tr');
      for (const text of [r.name, r.computed, r.applied]) tr.append(el('td', text));
      const status = el('td');
      status.append(el('span', r.status, r.status === 'Computed' ? 'tag' : 'tag tag-estimate'));
      tr.append(status);
      const cell = el('td');
      const key = r.override;
      if (key) {
        const input = el('input');
        input.type = 'number';
        input.min = '0';
        input.max = '100';
        input.step = '0.1';
        input.setAttribute('aria-label', `${r.name} override`);
        input.addEventListener('change', () => {
          if (input.value.trim() === '') state.clearOverride(key);
          else if (!state.setOverride(key, Number(input.value) / 100)) return;
          render();
          onChange?.();
        });
        const reset = el('button', 'Reset');
        reset.type = 'button';
        reset.disabled = r.status === 'Computed';
        reset.addEventListener('click', () => {
          state.clearOverride(key);
          render();
          onChange?.();
        });
        cell.append(input, ' ', reset);
      }
      tr.append(cell);
      table.append(tr);
    }
    root.append(table);

    if (p.lowCountWarning) {
      root.append(notice(`Warning: rates are based on ${p.rates.counts.settled} settled citations, fewer than ${p.threshold}.`, 'estimate'));
    }
  }

  render();
  return { refresh: render, settings: state.settings };
}
