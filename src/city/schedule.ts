import type { FineEntry, NamedLocation } from '../types.ts';

/** Minimal CSV reader: quoted cells, doubled quotes, CRLF or LF. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** Rows keyed by header name, each with its 1-based file line for error messages. Unknown columns are ignored. */
function readTable(file: string, text: string, required: string[]): { line: number; cells: Record<string, string> }[] {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new Error(`${file}: empty file`);
  const header = head.map((h) => h.trim());
  for (const name of required) if (!header.includes(name)) throw new Error(`${file}: missing column ${name}`);
  return body.map((cells, i) => {
    if (cells.length !== header.length) throw new Error(`${file} line ${i + 2}: expected ${header.length} cells, found ${cells.length}`);
    return { line: i + 2, cells: Object.fromEntries(header.map((h, j) => [h, cells[j].trim()])) };
  });
}

function number(file: string, line: number, field: string, raw: string): number {
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) throw new Error(`${file} line ${line}: ${field} must be a number, found "${raw}"`);
  return n;
}

function isoDate(file: string, line: number, field: string, raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) throw new Error(`${file} line ${line}: ${field} must be an ISO date (YYYY-MM-DD), found "${raw}"`);
  return raw;
}

/** The prefix before the first "-" ("CVC-22500(g)" gives "CVC"), or the whole code when it has no dash. */
export function codeSource(code: string): string {
  const i = code.indexOf('-');
  return i < 0 ? code : code.slice(0, i);
}

/** Reads `fine-schedule.csv` (DR-8). A code may repeat; each code may have only one blank-start row and no repeated start date. */
export function parseFineSchedule(text: string, file = 'fine-schedule.csv'): FineEntry[] {
  const entries: FineEntry[] = [];
  const seen = new Set<string>();
  for (const { line, cells } of readTable(file, text, ['citation_code', 'citation_name', 'base_amount', 'escalated_amount'])) {
    const code = cells.citation_code;
    if (!code) throw new Error(`${file} line ${line}: citation_code is required`);
    if (!cells.citation_name) throw new Error(`${file} line ${line}: citation_name is required`);
    const entry: FineEntry = {
      code,
      name: cells.citation_name,
      base: number(file, line, 'base_amount', cells.base_amount),
      escalated: number(file, line, 'escalated_amount', cells.escalated_amount),
    };
    if (entry.base < 0 || entry.escalated < 0) throw new Error(`${file} line ${line}: amounts must not be negative`);
    if (cells.start_date) entry.startDate = isoDate(file, line, 'start_date', cells.start_date);
    if (cells.escalation_days) {
      entry.escalationDays = number(file, line, 'escalation_days', cells.escalation_days);
      if (!Number.isInteger(entry.escalationDays) || entry.escalationDays < 0) throw new Error(`${file} line ${line}: escalation_days must be a non-negative integer`);
    }
    if (cells.sample_weight) {
      entry.sampleWeight = number(file, line, 'sample_weight', cells.sample_weight);
      if (entry.sampleWeight < 0) throw new Error(`${file} line ${line}: sample_weight must not be negative`);
    }
    const key = `${code}|${entry.startDate ?? ''}`;
    if (seen.has(key)) {
      throw new Error(
        entry.startDate
          ? `${file} line ${line}: ${code} already has a row starting ${entry.startDate}`
          : `${file} line ${line}: ${code} already has a row with a blank start date; increases need an explicit start date`,
      );
    }
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

/** The entry for `code` with the latest start date on or before `date` (ISO); a blank start date counts as the beginning of time (FR-14a). */
export function resolveFine(entries: FineEntry[], code: string, date: string): FineEntry | undefined {
  let best: FineEntry | undefined;
  for (const e of entries) {
    if (e.code !== code || (e.startDate !== undefined && e.startDate > date)) continue;
    if (!best || (e.startDate ?? '') > (best.startDate ?? '')) best = e;
  }
  return best;
}

/** Reads `named-locations.csv` (DR-10): one row per address, a location repeating its id on each row. */
export function parseNamedLocations(text: string, file = 'named-locations.csv'): NamedLocation[] {
  const byId = new Map<string, NamedLocation>();
  for (const { line, cells } of readTable(file, text, ['location_id', 'location_name', 'address'])) {
    const id = cells.location_id;
    if (!id) throw new Error(`${file} line ${line}: location_id is required`);
    if (!cells.location_name) throw new Error(`${file} line ${line}: location_name is required`);
    if (!cells.address) throw new Error(`${file} line ${line}: address is required`);
    let loc = byId.get(id);
    if (!loc) {
      loc = { id, name: cells.location_name, addresses: [] };
      byId.set(id, loc);
    } else if (loc.name !== cells.location_name) {
      throw new Error(`${file} line ${line}: ${id} is named "${loc.name}" on an earlier row and "${cells.location_name}" here`);
    }
    loc.addresses.push(cells.address);
    const { latitude = '', longitude = '', notes = '' } = cells;
    if ((latitude === '') !== (longitude === '')) throw new Error(`${file} line ${line}: latitude and longitude must both be set or both blank`);
    if (latitude !== '' && loc.lat === undefined) {
      const lat = number(file, line, 'latitude', latitude);
      const lon = number(file, line, 'longitude', longitude);
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error(`${file} line ${line}: coordinates out of range`);
      loc.lat = lat;
      loc.lon = lon;
    }
    if (notes !== '' && loc.notes === undefined) loc.notes = notes;
  }
  return [...byId.values()];
}
