import { buildLocationHistory } from '../reports/r4.ts';
import type { Citation, NamedLocation } from '../types.ts';

export interface R4Input {
  citations: Citation[];
  namedLocations: NamedLocation[];
}

export const R4_NOTICE = 'Citations reflect enforcement activity, not violation rates.';
const HISTORY_ROWS = 50;

export function mountR4Panel(root: HTMLElement, input: () => R4Input | undefined): { refresh(): void } {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const table = (head: string[], rows: string[][]) => {
    const t = el('table');
    const h = el('tr');
    for (const c of head) h.append(el('th', c));
    t.append(h);
    for (const r of rows) {
      const tr = el('tr');
      for (const c of r) tr.append(el('td', c));
      t.append(tr);
    }
    return t;
  };

  const picker = el('select');
  const detail = el('div');
  root.append(el('h2', 'R4 Named locations'), el('p', R4_NOTICE), picker, detail);

  function showDetail(): void {
    detail.replaceChildren();
    const i = input();
    const loc = i?.namedLocations.find((l) => l.id === picker.value);
    if (!i || !loc) return;
    const h = buildLocationHistory(loc, i.citations);
    detail.append(el('p', `${h.name}: ${h.total.toLocaleString()} citations`));
    if (h.total === 0) return;
    detail.append(el('h3', 'Monthly trend'), table(['Month', 'Citations'], h.trend.map((t) => [t.month, String(t.count)])));
    detail.append(
      el('h3', h.total > HISTORY_ROWS ? `History (latest ${HISTORY_ROWS})` : 'History'),
      table(
        ['Date', 'Time', 'Code', 'Result', 'Address'],
        h.history.slice(0, HISTORY_ROWS).map((c) => [c.date, c.time, c.code, c.result, c.address]),
      ),
    );
  }

  function render(): void {
    const i = input();
    const keep = picker.value;
    picker.replaceChildren();
    if (!i) {
      detail.replaceChildren(el('p', 'Load citation data to see named locations.'));
      return;
    }
    for (const l of i.namedLocations) picker.append(new Option(`${l.name} (${l.addresses[0] ?? l.id})`, l.id));
    if (i.namedLocations.some((l) => l.id === keep)) picker.value = keep;
    showDetail();
  }

  picker.addEventListener('change', showDetail);
  render();
  return { refresh: render };
}
