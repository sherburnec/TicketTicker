import type { Citation, NamedLocation } from '../types.ts';

export interface LocationHistory {
  id: string;
  name: string;
  total: number;
  /** Citations at the location, newest first. */
  history: Citation[];
  /** Citations per calendar month from the first to the last month with a citation, gaps included as zero. */
  trend: { month: string; count: number }[];
}

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) (m = 1), y++;
  }
  return out;
}

/** R4 Named locations: the history and monthly trend of one named location (G2). */
export function buildLocationHistory(location: NamedLocation, citations: Citation[]): LocationHistory {
  const history = citations
    .filter((c) => c.namedLocationId === location.id)
    .sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
  const perMonth = new Map<string, number>();
  for (const c of history) perMonth.set(c.date.slice(0, 7), (perMonth.get(c.date.slice(0, 7)) ?? 0) + 1);
  const trend =
    history.length === 0
      ? []
      : monthsBetween(history[history.length - 1].date.slice(0, 7), history[0].date.slice(0, 7)).map((month) => ({
          month,
          count: perMonth.get(month) ?? 0,
        }));
  return { id: location.id, name: location.name, total: history.length, history, trend };
}
