import { patrolRejectsToCsv, type PatrolCounts, type PatrolRejected } from '../patrol/importer.ts';
import type { PatrolFormat } from '../patrol/formats.ts';

const LIST_LIMIT = 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Counts and the rejected rows with a CSV download (FR-31). Data is set as text, never HTML. */
export function renderPatrolSummary(
  root: HTMLElement,
  format: PatrolFormat,
  result: { counts: PatrolCounts; rejected: PatrolRejected[] },
): void {
  const { counts, rejected } = result;
  const n = (v: number) => v.toLocaleString();
  root.replaceChildren(el('h2', 'Patrol import summary'));
  root.append(el('p', `Rows read: ${n(counts.read)}. Imported: ${n(counts.imported)}. Rejected: ${n(counts.rejected)}. Duplicates ignored: ${n(counts.duplicates)}. Out of order ignored: ${n(counts.outOfOrder)}.`));
  if (rejected.length === 0) return;

  const warning = el('section');
  warning.setAttribute('role', 'alert');
  warning.append(el('h3', `Warning: ${n(rejected.length)} row${rejected.length === 1 ? ' was' : 's were'} rejected`));
  const ul = el('ul');
  for (const r of rejected.slice(0, LIST_LIMIT)) ul.append(el('li', `Row ${r.rowNumber}: ${r.reason}`));
  if (rejected.length > LIST_LIMIT) ul.append(el('li', `…and ${n(rejected.length - LIST_LIMIT)} more`));
  const button = el('button', 'Download rejected rows (CSV)');
  button.type = 'button';
  button.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([patrolRejectsToCsv(format, rejected)], { type: 'text/csv' }));
    const a = el('a');
    a.href = url;
    a.download = 'patrol-rejected-rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
  warning.append(ul, button);
  root.append(warning);
}
