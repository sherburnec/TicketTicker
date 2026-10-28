import type { PatrolImportResult } from '../patrol/importer.ts';
import { patrolRejectsToCsv } from '../patrol/importer.ts';
import type { PatrolSummary } from '../patrol/summary.ts';
import { el, heading } from './dom.ts';

const LIST_LIMIT = 100;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const n = (v: number) => v.toLocaleString();

/** The summary lines (FR-33, FR-34), as text so they can be tested without a DOM. */
export function patrolSummaryLines(s: PatrolSummary): string[] {
  const { counts, excluded } = s;
  const lines = [
    `Format ${s.format}. Times without an offset were read in ${s.timeZone}; days and hours are in ${s.cityTimeZone}.`,
    `Rows read: ${n(counts.read)}. Imported: ${n(counts.imported)}. Rejected: ${n(counts.rejected)}.`,
    `Points excluded: ${n(s.excludedTotal)} (outside city extent ${n(excluded['Outside city extent'])}, inside exclusion zone ${n(excluded['Inside exclusion zone'])}, inside depot zone ${n(excluded['Inside depot zone'])}).`,
    `Duplicates ignored: ${n(counts.duplicates)}. Out-of-order points ignored: ${n(counts.outOfOrder)}.`,
    s.dateRange ? `Date range: ${s.dateRange.from} to ${s.dateRange.to}.` : 'Date range: none.',
    `Vehicles: ${n(s.vehicleCount)}.`,
  ];
  if (s.format === 'A') lines.push(s.medianPingSeconds === undefined ? 'Median ping interval: not available.' : `Median ping interval: ${s.medianPingSeconds} seconds.`);
  else lines.push(`Stops not placed on a block: ${n(s.unmatchedStops)}.`);
  lines.push(`Day-by-hour cells with no data: ${n(s.emptyDayHours.length)} of 168.`);
  return lines;
}

/** Compact day-by-hour listing of the empty cells, one line per day, so gaps are visible before the heatmap is read. */
export function emptyCellLines(s: PatrolSummary): string[] {
  return DAYS.map((d, dow) => {
    const hours = s.emptyDayHours.filter((c) => c.dow === dow).map((c) => String(c.hour).padStart(2, '0'));
    return hours.length === 0 ? '' : `${d}: ${hours.length === 24 ? 'all hours' : hours.join(' ')}`;
  }).filter(Boolean);
}

/** Summary, empty-cell list and the rejected rows with a CSV download (FR-31, FR-34). Data is set as text, never HTML. */
export function renderPatrolSummary(root: HTMLElement, result: PatrolImportResult): void {
  const { summary, rejected } = result;
  root.replaceChildren(heading('Import summary'));
  const ul = el('ul', undefined, 'plain');
  for (const l of patrolSummaryLines(summary)) ul.append(el('li', l));
  root.append(ul);

  const gaps = emptyCellLines(summary);
  if (gaps.length > 0) {
    const details = el('details');
    details.append(el('summary', 'Hours with no patrol data'));
    for (const g of gaps) details.append(el('div', g));
    root.append(details);
  }

  if (result.unmatched.length > 0) {
    const details = el('details');
    details.append(el('summary', `Unmatched stop addresses (${n(result.unmatched.length)})`));
    const list = el('ul');
    for (const u of result.unmatched.slice(0, LIST_LIMIT)) list.append(el('li', `${u.address} (${n(u.count)})`));
    details.append(list);
    root.append(details);
  }

  if (rejected.length === 0) return;
  const warning = el('section');
  warning.setAttribute('role', 'alert');
  warning.append(el('h3', `Warning: ${n(rejected.length)} row${rejected.length === 1 ? ' was' : 's were'} rejected`));
  const list = el('ul');
  for (const r of rejected.slice(0, LIST_LIMIT)) list.append(el('li', `Row ${r.rowNumber}: ${r.reason}`));
  if (rejected.length > LIST_LIMIT) list.append(el('li', `…and ${n(rejected.length - LIST_LIMIT)} more`));
  const button = el('button', 'Download rejected rows (CSV)');
  button.type = 'button';
  button.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([patrolRejectsToCsv(summary.format, rejected)], { type: 'text/csv' }));
    const a = el('a');
    a.href = url;
    a.download = 'patrol-rejected-rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
  warning.append(list, button);
  root.append(warning);
}
