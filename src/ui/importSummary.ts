import type { ImportResult, RejectedRow } from '../import/citations.ts';
import { disclosure, el, heading } from './dom.ts';

/** Rows listed on screen before "and N more"; the downloaded CSV always holds all of them. */
const LIST_LIMIT = 100;

const csvCell = (s: string | number) => {
  const t = String(s);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csvLine = (cells: (string | number)[]) => cells.map(csvCell).join(',');

/** The rejects file (FR-8): record number, reason, and the original row's cells re-encoded as one CSV cell. */
export function rejectsToCsv(rejected: RejectedRow[]): string {
  const lines = rejected.map((r) => csvLine([r.rowNumber, r.reason, csvLine(r.raw)]));
  return [csvLine(['Row', 'Reason', 'Original row']), ...lines].join('\n') + '\n';
}

/** How many accepted rows carry each flag (DR-4, DR-5, DR-12), most common first. */
export function flagCounts(result: ImportResult): [flag: string, count: number][] {
  const counts = new Map<string, number>();
  for (const c of result.citations) for (const f of c.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Unmatched addresses grouped by address text, most frequent first (FR-11). */
export function unmatchedByAddress(result: ImportResult): [address: string, count: number][] {
  const counts = new Map<string, number>();
  for (const u of result.unmatched) counts.set(u.address, (counts.get(u.address) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function list(items: string[], total: number): HTMLUListElement {
  const ul = el('ul');
  for (const text of items.slice(0, LIST_LIMIT)) ul.append(el('li', text));
  if (total > LIST_LIMIT) ul.append(el('li', `…and ${(total - LIST_LIMIT).toLocaleString()} more`));
  return ul;
}

/** Shows counts, the reject warning, flags and unmatched addresses after an import (FR-7, FR-9, FR-11). Data is set as text, never HTML. */
export function renderImportSummary(root: HTMLElement, result: ImportResult): void {
  const { total, imported, rejected, unmatched } = result.counts;
  const n = (v: number) => v.toLocaleString();
  root.replaceChildren(heading('Import summary'));
  const counts = el('dl', undefined, 'figures');
  for (const [label, value, kind] of [['Total rows', total, ''], ['Imported', imported, 'ok'], ['Rejected', rejected, rejected > 0 ? 'error' : '']] as const) {
    const wrap = el('div', undefined, kind ? `figure figure-${kind}` : 'figure');
    wrap.append(el('dt', label), el('dd', n(value)));
    counts.append(wrap);
  }
  root.append(counts);

  if (rejected > 0) {
    const warning = el('section');
    warning.setAttribute('role', 'alert');
    warning.append(el('h3', `Warning: ${n(rejected)} row${rejected === 1 ? ' was' : 's were'} rejected`));
    warning.append(disclosure('Show rejected rows', list(result.rejected.map((r) => `Row ${r.rowNumber}: ${r.reason}`), rejected)));
    const button = el('button', 'Download rejected rows (CSV)');
    button.type = 'button';
    button.addEventListener('click', () => download('rejected-rows.csv', rejectsToCsv(result.rejected)));
    warning.append(button);
    root.append(warning);
  }

  const flags = flagCounts(result);
  if (flags.length > 0) {
    root.append(disclosure(`Flagged rows: ${flags.length} kind${flags.length === 1 ? '' : 's'} (imported, but worth checking)`, list(flags.map(([flag, count]) => `${flag}: ${n(count)}`), flags.length)));
  }

  if (unmatched > 0) {
    const groups = unmatchedByAddress(result);
    root.append(disclosure(`Unmatched addresses: ${n(unmatched)} row${unmatched === 1 ? '' : 's'}, ${n(groups.length)} distinct`, list(groups.map(([address, count]) => `${address} (${n(count)})`), groups.length)));
  }
}
