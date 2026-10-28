import { project, type Projection } from '../revenue/projection.ts';
import type { RateContext, RateOverrides } from '../revenue/rates.ts';
import type { Citation, FineEntry, FineResult } from '../types.ts';

export const RESULTS: FineResult[] = ['Paid', 'Unpaid', 'Pending', 'Reversed'];

export interface TypeRow {
  code: string;
  name: string;
  total: number;
  byResult: Record<FineResult, number>;
}

export interface Overview {
  total: number;
  byResult: Record<FineResult, number>;
  /** One row per citation code, most citations first. */
  byType: TypeRow[];
  projection: Projection;
}

const zero = (): Record<FineResult, number> => ({ Paid: 0, Unpaid: 0, Pending: 0, Reversed: 0 });

/** R1 Overview: totals by type and result, with Realized and Projected revenue (§9). */
export function buildOverview(
  citations: Citation[],
  ctx: RateContext,
  asOf: string,
  overrides: RateOverrides = {},
): Overview {
  const names = new Map<string, FineEntry['name']>();
  for (const e of ctx.schedule) names.set(e.code, e.name);

  const byResult = zero();
  const types = new Map<string, TypeRow>();
  for (const c of citations) {
    byResult[c.result]++;
    let row = types.get(c.code);
    if (!row) types.set(c.code, (row = { code: c.code, name: names.get(c.code) ?? c.code, total: 0, byResult: zero() }));
    row.total++;
    row.byResult[c.result]++;
  }
  const byType = [...types.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
  return { total: citations.length, byResult, byType, projection: project(citations, ctx, asOf, overrides) };
}
