import type { Citation, CitySettings, FineEntry, FineResult, NamedLocation } from '../types.ts';
import { buildMatchIndex, matchAddress, type BlockInfo } from '../geo/matcher.ts';
import { resolveFine } from '../city/schedule.ts';
import { sampleConfig, type SampleConfig } from './config.ts';
import { createRng, type Rng } from './rng.ts';

/** What the generator draws from: the city's own files only (FR-4, FR-4c). */
export interface CitationSource {
  city: CitySettings;
  schedule: FineEntry[];
  blocks: BlockInfo[];
  namedLocations: NamedLocation[];
}

export const CITATION_HEADERS = [
  'Citation ID', 'Date', 'Time', 'Citation code', 'Officer #', 'Fine result', 'Fine amount', 'Paid amount', 'Paid date',
  'Address', 'Vehicle type', 'Vehicle color',
];

const VEHICLE_TYPES = ['Sedan', 'SUV', 'Truck', 'Van', 'Coupe', 'Motorcycle'];
const VEHICLE_COLORS = ['Black', 'White', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Tan'];
/** Relative citation volume by hour of day, 06:00 to 21:00. */
const HOUR_WEIGHTS = [2, 4, 8, 10, 10, 9, 8, 8, 9, 9, 8, 6, 4, 3, 2, 1];
const HOUR_START = 6;
const DAY_MS = 86400000;

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const isoOf = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** First day of a sample that ends on `endDate` and spans `months` months. */
function startOf(endDate: string, months: number): string {
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return isoOf(Math.round(d.getTime() / DAY_MS) + 1);
}

/** Addresses known to resolve to a block, so every citation matches by construction (FR-4). */
function buildSpots(source: CitationSource): { block: string[]; named: string[] } {
  const index = buildMatchIndex(source.blocks, source.namedLocations);
  const block: string[] = [];
  for (const b of source.blocks) {
    if (b.blockNumber === null) continue;
    const hundred = (n: number | null) => n !== null && Math.floor(n / 100) * 100 === b.blockNumber;
    const ranged = hundred(b.lowAddress) && hundred(b.highAddress);
    const from = ranged ? b.lowAddress! : b.blockNumber + 1;
    const to = ranged ? b.highAddress! : b.blockNumber + 99;
    // A few addresses per block keep the output varied without trying every number.
    const step = Math.max(1, Math.floor((to - from) / 4));
    for (let n = from; n <= to; n += step) {
      const address = `${n} ${b.street}`;
      if (matchAddress(address, index).blockId === b.id) block.push(address);
    }
  }
  const named: string[] = [];
  for (const loc of source.namedLocations)
    for (const address of loc.addresses) if (matchAddress(address, index).blockId !== undefined) named.push(address);
  return { block, named };
}

/** Draws outcome shares that each vary from the base by at most the monthly variation and still sum to 1. */
function monthShares(cfg: SampleConfig, rng: Rng): { paid: number; reversed: number } {
  const v = cfg.monthlyVariation;
  for (;;) {
    const dp = (rng.next() * 2 - 1) * v;
    const dr = (rng.next() * 2 - 1) * v;
    if (Math.abs(dp + dr) <= v) return { paid: cfg.outcomeShares.paid + dp, reversed: cfg.outcomeShares.reversed + dr };
  }
}

/** Builds the citation rows for a sample (FR-4, FR-4d), ordered by date and time. */
export function generateCitationRows(cfgIn: Partial<SampleConfig>, source: CitationSource): Citation[] {
  const cfg = sampleConfig(cfgIn);
  const rng = createRng(cfg.seed ?? Math.floor(Math.random() * 2 ** 32));
  const spots = buildSpots(source);
  if (spots.block.length === 0) throw new Error(`city ${source.city.id}: no block addresses to draw citations from`);
  const codes = [...new Set(source.schedule.map((e) => e.code))];
  const asOf = day(cfg.endDate);
  const rows: Citation[] = [];
  const shares = new Map<string, { paid: number; reversed: number }>();
  let seq = 0;

  for (let d = day(startOf(cfg.endDate, cfg.durationMonths)); d <= asOf; d++) {
    const date = isoOf(d);
    const month = date.slice(0, 7);
    if (!shares.has(month)) shares.set(month, monthShares(cfg, rng));
    const { paid, reversed } = shares.get(month)!;
    const fines = codes.flatMap((c) => resolveFine(source.schedule, c, date) ?? []);
    const count = fines.length === 0 ? 0 : Math.max(0, Math.round(rng.normal(cfg.citationsPerDay, cfg.citationsPerDay * cfg.dailyVariation)));
    const dayRows: Citation[] = [];

    for (let i = 0; i < count; i++) {
      const fine = rng.weighted(fines, (f) => f.sampleWeight ?? 1);
      const window = fine.escalationDays ?? source.city.paymentWindowDays;
      const age = asOf - d;
      const inWindow = age <= window;
      const useNamed = spots.named.length > 0 && rng.chance(cfg.namedLocationShare);
      const hour = HOUR_START + rng.weighted([...HOUR_WEIGHTS.keys()], (h) => HOUR_WEIGHTS[h]);

      let result: FineResult;
      if (inWindow && rng.chance(cfg.pendingShare)) result = 'Pending';
      else {
        const r = rng.next();
        result = r < paid ? 'Paid' : r < paid + reversed ? 'Reversed' : 'Unpaid';
      }

      const row: Citation = {
        id: '',
        date,
        time: `${pad(hour)}:${pad(rng.int(0, 59))}`,
        code: fine.code,
        officer: String(1000 + rng.int(1, cfg.officerCount)),
        result,
        fineAmount: fine.base,
        address: rng.pick(useNamed ? spots.named : spots.block),
        flags: [],
      };
      if (result === 'Paid') {
        // The escalated amount applies only past the window; a payment never falls after the as-of date.
        const escalated = !inWindow && rng.chance(cfg.escalatedPaidShare);
        row.paidAmount = escalated ? fine.escalated : fine.base;
        row.paidDate = isoOf(d + (escalated ? rng.int(window + 1, Math.min(window + 30, age)) : rng.int(0, Math.min(window, age))));
      }
      if (rng.chance(0.9)) {
        row.vehicleType = rng.pick(VEHICLE_TYPES);
        row.vehicleColor = rng.pick(VEHICLE_COLORS);
      }
      dayRows.push(row);
    }

    dayRows.sort((a, b) => a.time.localeCompare(b.time));
    for (const row of dayRows) row.id = `C${pad(++seq, 7)}`;
    rows.push(...dayRows);
  }
  return rows;
}

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function citationsToCsv(rows: Citation[]): string {
  const lines = rows.map((r) =>
    [r.id, r.date, r.time, r.code, r.officer, r.result, r.fineAmount, r.paidAmount, r.paidDate, r.address, r.vehicleType, r.vehicleColor].map(cell).join(','),
  );
  return [CITATION_HEADERS.join(','), ...lines].join('\n') + '\n';
}

/** Generates a citation sample as CSV text, ready for the same importer as an upload (FR-4a). */
export function generateCitations(cfg: Partial<SampleConfig>, source: CitationSource): string {
  return citationsToCsv(generateCitationRows(cfg, source));
}
