import { project, type Projection } from '../revenue/projection.ts';
import type { RateContext, RateOverrides } from '../revenue/rates.ts';
import { asOfDate } from '../revenue/schedule.ts';
import type { Citation } from '../types.ts';

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
    view(): RatesView | undefined {
      const data = input();
      const asOf = data && asOfDate(data.citations, asOfOverride);
      if (!data || !asOf) return undefined;
      const projection = project(data.citations, data.ctx, asOf, overrides);
      return { asOf, projection, rows: rateRows(projection) };
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Rates and projections with computed and applied values, override inputs and an as-of date. Call `refresh` after new data loads. */
export function mountRatesPanel(root: HTMLElement, input: () => RatesInput | undefined): { refresh(): void } {
  const state = createRatesState(input);

  function render(): void {
    root.replaceChildren();
    const v = state.view();
    if (!v) {
      root.append(el('p', 'Load citation data to see rates and projections.'));
      return;
    }
    const { projection: p } = v;
    root.append(el('h2', 'Rates and projections'));

    const asOf = el('input');
    asOf.type = 'date';
    asOf.value = v.asOf;
    asOf.addEventListener('change', () => {
      state.setAsOf(asOf.value);
      render();
    });
    const asOfLabel = el('label', 'As-of date ');
    asOfLabel.append(asOf);
    root.append(asOfLabel);

    const table = el('table');
    const head = el('tr');
    for (const h of ['Rate', 'Computed', 'Applied', 'Status', 'Override (%)']) head.append(el('th', h));
    table.append(head);
    for (const r of v.rows) {
      const tr = el('tr');
      for (const text of [r.name, r.computed, r.applied, r.status]) tr.append(el('td', text));
      const cell = el('td');
      const key = r.override;
      if (key) {
        const field = el('input');
        field.type = 'number';
        field.min = '0';
        field.max = '100';
        field.step = '0.1';
        field.setAttribute('aria-label', `${r.name} override`);
        field.addEventListener('change', () => {
          if (field.value.trim() === '') state.clearOverride(key);
          else if (!state.setOverride(key, Number(field.value) / 100)) return;
          render();
        });
        const reset = el('button', 'Reset');
        reset.type = 'button';
        reset.disabled = r.status === 'Computed';
        reset.addEventListener('click', () => {
          state.clearOverride(key);
          render();
        });
        cell.append(field, reset);
      }
      tr.append(cell);
      table.append(tr);
    }
    root.append(table);

    const lines = [
      `Realized: ${money(p.realized.amount)}`,
      `Projected (average): ${money(p.projected.avg)}`,
      p.projected.low !== null && p.projected.high !== null
        ? `Projected range: ${money(p.projected.low)} to ${money(p.projected.high)}`
        : (p.projected.rangeNotice ?? ''),
      `Pending, not included in projections: ${p.pending.count.toLocaleString()} citations, ${money(p.pending.amount)} at stake`,
    ];
    const ul = el('ul');
    for (const l of lines.filter(Boolean)) ul.append(el('li', l));
    root.append(ul);
    if (p.lowCountWarning) {
      root.append(el('p', `Warning: rates are based on ${p.rates.counts.settled} settled citations, fewer than ${p.threshold}.`));
    }
  }

  render();
  return { refresh: render };
}
