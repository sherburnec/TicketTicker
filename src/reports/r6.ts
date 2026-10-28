import type { Citation, FineResult } from '../types.ts';

export interface OfficerRow {
  officer: string;
  total: number;
  byResult: Record<FineResult, number>;
}

/** R6 Officer activity (internal only, FR-24): citations by officer number, most first. */
export function buildOfficerActivity(citations: Citation[]): OfficerRow[] {
  const rows = new Map<string, OfficerRow>();
  for (const c of citations) {
    let row = rows.get(c.officer);
    if (!row) rows.set(c.officer, (row = { officer: c.officer, total: 0, byResult: { Paid: 0, Unpaid: 0, Pending: 0, Reversed: 0 } }));
    row.total++;
    row.byResult[c.result]++;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.officer.localeCompare(b.officer));
}
