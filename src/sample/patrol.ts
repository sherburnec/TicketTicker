import { PATROL_SAMPLE_DEFAULTS as D } from '../patrol/config.ts';
import { createExcluder, distanceM } from '../patrol/extent.ts';
import { parseTimestamp, zoneClock } from '../patrol/time.ts';
import type { PatrolFormat } from '../patrol/formats.ts';
import type { CitySettings } from '../types.ts';
import { sampleConfig, type SampleConfig } from './config.ts';
import { createRng, type Rng } from './rng.ts';

/** Everything the generator draws from: city settings and street geometry. It never reads citation data (FR-42). */
export interface PatrolSource {
  city: CitySettings;
  segments: { features: unknown[] };
}

export const PATROL_A_HEADERS = ['happenedAtTime', 'latitude', 'longitude', 'vehicle', 'speedMilesPerHour'];
export const PATROL_B_HEADERS = ['Asset', 'Trip Start Time', 'Trip Start Location', 'Trip End Time', 'Trip End Location', 'Distance (mi)'];

export type PatrolInjectKind = 'badTime' | 'latLonRange' | 'swapped' | 'zeroZero' | 'missingVehicle' | 'duplicate' | 'outsideExtent';

/** Error-injection mode (FR-46): how many invalid rows of each kind to add. Off unless passed. */
export type PatrolInject = Partial<Record<PatrolInjectKind, number>>;

const DAY_MS = 86400000;
const TICK_MS = D.pingSeconds * 1000;
const MPH_TO_MPS = 0.44704;
const M_PER_DEG_LAT = 111320;

type Pt = [lon: number, lat: number];

interface Edge {
  to: string;
  pts: Pt[];
  cum: number[];
  len: number;
  weight: number;
}

const nodeKey = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
const dist = (a: Pt, b: Pt) => distanceM(a[1], a[0], b[1], b[0]);

/**
 * The street graph from segment geometry: a node at each segment end, one edge each way. Only segments inside the
 * city extent are used, and only the largest connected piece, so a vehicle cannot be stranded or leave the city.
 */
function buildGraph(source: PatrolSource): { adj: Map<string, Edge[]>; nodes: Map<string, Pt> } {
  const keep = createExcluder({ ...source.city, exclusionZones: [], depot: { lat: 90, lon: 0 } }, 0);
  const zones = source.city.hotZoneWeights ?? [];
  const adj = new Map<string, Edge[]>();
  const nodes = new Map<string, Pt>();
  const addEdge = (from: Pt, pts: Pt[]) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const mid = pts[Math.floor(pts.length / 2)];
    let weight = 1;
    for (const z of zones) if (distanceM(mid[1], mid[0], z.lat, z.lon) <= D.hotZoneRadiusMeters) weight += z.weight;
    const k = nodeKey(from);
    nodes.set(k, from);
    adj.set(k, [...(adj.get(k) ?? []), { to: nodeKey(pts[pts.length - 1]), pts, cum, len: cum[cum.length - 1], weight }]);
  };
  for (const f of source.segments.features as { geometry: { coordinates: Pt[] } }[]) {
    const pts = f.geometry.coordinates;
    if (pts.length < 2 || pts.some((p) => keep(p[1], p[0]) === 'Outside city extent')) continue;
    if (nodeKey(pts[0]) === nodeKey(pts[pts.length - 1])) continue;
    addEdge(pts[0], pts);
    addEdge(pts[pts.length - 1], [...pts].reverse());
  }
  for (const list of adj.values()) for (const e of list) if (!adj.has(e.to)) adj.set(e.to, []);

  // Largest connected component, found over the undirected view (edges exist both ways).
  const seen = new Set<string>();
  let best: string[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    for (let i = 0; i < comp.length; i++) for (const e of adj.get(comp[i])!) if (!seen.has(e.to)) (seen.add(e.to), comp.push(e.to));
    if (comp.length > best.length) best = comp;
  }
  const inBest = new Set(best);
  for (const k of [...adj.keys()]) {
    if (!inBest.has(k)) adj.delete(k);
    else adj.set(k, adj.get(k)!.filter((e) => inBest.has(e.to)));
  }
  return { adj, nodes };
}

interface Tick {
  time: number;
  lon: number;
  lat: number;
  mph: number;
}

interface Trip {
  start: { time: number; lon: number; lat: number };
  end: { time: number; lon: number; lat: number };
  miles: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (t: number) => new Date(t).toISOString().slice(0, 19) + 'Z';

/** One vehicle's shift: a tick every ping interval, with idle at the depot, drives, stops and a mid-shift break. */
function simulateShift(rng: Rng, graph: ReturnType<typeof buildGraph>, source: PatrolSource, from: number, to: number): { ticks: Tick[]; trips: Trip[] } {
  const depot: Pt = [source.city.depot.lon, source.city.depot.lat];
  let nearest = '';
  let bestD = Infinity;
  for (const [k, p] of graph.nodes) {
    if (!graph.adj.has(k)) continue;
    const d = dist(p, depot);
    if (d < bestD) (bestD = d), (nearest = k);
  }
  const total = Math.floor((to - from) / TICK_MS);
  const breakAt = Math.floor(total / 2);
  const breakTicks = Math.round((D.breakMinutes * 60000) / TICK_MS);
  const ticks: Tick[] = [];
  const trips: Trip[] = [];

  let edge: Edge | undefined;
  let s = 0;
  let node = nearest;
  let cameFrom = '';
  let mph = 0;
  let stopLeft = 0;
  let tripStart: Trip['start'] | undefined;
  let miles = 0;

  const here = (): Pt => {
    if (!edge) return graph.nodes.get(node)!;
    let i = 1;
    while (i < edge.cum.length - 1 && edge.cum[i] < s) i++;
    const span = edge.cum[i] - edge.cum[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (s - edge.cum[i - 1]) / span));
    return [edge.pts[i - 1][0] + (edge.pts[i][0] - edge.pts[i - 1][0]) * f, edge.pts[i - 1][1] + (edge.pts[i][1] - edge.pts[i - 1][1]) * f];
  };
  const pickEdge = () => {
    const options = graph.adj.get(node)!;
    const forward = options.filter((e) => e.to !== cameFrom);
    const pool = forward.length > 0 ? forward : options;
    edge = rng.weighted(pool, (e) => e.weight);
    s = 0;
    mph = rng.int(D.speedMph.min, D.speedMph.max);
  };
  const advance = (meters: number) => {
    while (meters > 0) {
      if (!edge) pickEdge();
      const e = edge!;
      if (meters < e.len - s) {
        s += meters;
        return;
      }
      meters -= e.len - s;
      cameFrom = node;
      node = e.to;
      edge = undefined;
    }
  };
  const endTrip = (time: number, at: Pt) => {
    if (tripStart) trips.push({ start: tripStart, end: { time, lon: at[0], lat: at[1] }, miles });
    tripStart = undefined;
    miles = 0;
  };

  for (let i = 0; i < total; i++) {
    const time = from + i * TICK_MS;
    if (i < D.depotPings || i >= total - D.depotPings) {
      ticks.push({ time, lon: depot[0], lat: depot[1], mph: 0 });
      continue;
    }
    if (i === D.depotPings) tripStart = { time, lon: depot[0], lat: depot[1] };
    if (stopLeft === 0 && i === breakAt) stopLeft = breakTicks;
    else if (stopLeft === 0 && rng.chance(D.stopChance)) stopLeft = rng.int(Math.ceil((D.stopMinutes.min * 60000) / TICK_MS), Math.floor((D.stopMinutes.max * 60000) / TICK_MS));

    if (stopLeft > 0) {
      const p = here();
      if (tripStart) endTrip(time, p);
      stopLeft--;
      ticks.push({ time, lon: p[0], lat: p[1], mph: 0 });
      continue;
    }
    const p0 = here();
    if (!tripStart) tripStart = { time, lon: p0[0], lat: p0[1] };
    if (!edge) pickEdge();
    const meters = mph * MPH_TO_MPS * D.pingSeconds;
    advance(meters);
    miles += meters / 1609.344;
    const p = here();
    ticks.push({ time, lon: p[0], lat: p[1], mph });
  }
  endTrip(from + total * TICK_MS, depot);
  // The trip that ends at the depot starts where the vehicle was last seen; keep it only if it moved.
  return { ticks, trips: trips.filter((t) => t.end.time > t.start.time) };
}

/** First day of a sample that ends on `endDate` and spans `months` months. */
function startOf(endDate: string, months: number): number {
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return Math.round(d.getTime() / DAY_MS) + 1;
}

type Row = Record<string, string>;

const loc = (lat: number, lon: number) => `"${lat.toFixed(6)}, ${lon.toFixed(6)}"`;

const FIELDS: Record<PatrolFormat, { vehicle: string; time: string[]; at: { lat?: string; lon?: string; loc?: string[] } }> = {
  A: { vehicle: 'vehicle', time: ['happenedAtTime'], at: { lat: 'latitude', lon: 'longitude' } },
  B: { vehicle: 'Asset', time: ['Trip Start Time', 'Trip End Time'], at: { loc: ['Trip Start Location'] } },
};

/** Adds invalid rows (FR-46), each a copy of a distinct valid row with one fault. Uses its own random stream. */
function inject(rows: Row[], format: PatrolFormat, source: PatrolSource, counts: PatrolInject, rng: Rng): { rows: Row[]; injected: Record<PatrolInjectKind, number> } {
  const injected: Record<PatrolInjectKind, number> = { badTime: 0, latLonRange: 0, swapped: 0, zeroZero: 0, missingVehicle: 0, duplicate: 0, outsideExtent: 0 };
  const f = FIELDS[format];
  const bbox = 'bbox' in source.city.extent ? source.city.extent.bbox : [-180, -90, 180, 90];
  const available = rows.map((_, i) => i);
  const after = new Map<number, Row[]>();
  const setAt = (r: Row, lat: number, lon: number) => {
    if (f.at.lat) (r[f.at.lat] = String(lat)), (r[f.at.lon!] = String(lon));
    else r[f.at.loc![0]] = loc(lat, lon);
  };

  for (const kind of Object.keys(injected) as PatrolInjectKind[]) {
    for (let n = 0; n < (counts[kind] ?? 0) && available.length > 0; n++) {
      const i = available.splice(rng.int(0, available.length - 1), 1)[0];
      const original = rows[i];
      const r: Row = { ...original };
      if (kind === 'badTime') r[f.time[0]] = rng.pick(['not-a-time', '2025-13-45T99:00:00Z', '']);
      else if (kind === 'latLonRange') setAt(r, 95.5, -118.3);
      else if (kind === 'swapped') setAt(r, -118.3, 34.18);
      else if (kind === 'zeroZero') setAt(r, 0, 0);
      else if (kind === 'missingVehicle') r[f.vehicle] = '';
      else if (kind === 'outsideExtent') {
        setAt(r, bbox[3] + 0.05, bbox[0] - 0.05);
        for (const t of f.time) r[t] = iso(Date.parse(r[t]) + 1000);
      }
      // A duplicate keeps every field, so the importer sees the same vehicle and time again.
      after.set(i, [...(after.get(i) ?? []), { ...(kind === 'duplicate' ? original : r) }]);
      injected[kind]++;
    }
  }
  const out: Row[] = [];
  rows.forEach((r, i) => {
    out.push(r);
    out.push(...(after.get(i) ?? []));
  });
  return { rows: out, injected };
}

const cell = (s: string) => (/[",\n\r]/.test(s) && !/^".*"$/s.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export interface PatrolSample {
  csv: string;
  /** How many rows of each invalid kind were actually added. */
  injected: Record<PatrolInjectKind, number>;
}

/**
 * Generates patrol data from the street geometry (FR-41 to FR-44, FR-46). Routes follow street segments only; the
 * depot, shifts, ping interval, jitter, dropped pings and gaps come from `PATROL_SAMPLE_DEFAULTS` and city settings.
 * The duration is the shared sample variable (FR-43) and a seed makes a run reproducible.
 */
export function generatePatrolSample(cfgIn: Partial<SampleConfig>, source: PatrolSource, format: PatrolFormat = 'A', errors?: PatrolInject): PatrolSample {
  const cfg = sampleConfig(cfgIn);
  const rng = createRng(cfg.seed ?? Math.floor(Math.random() * 2 ** 32));
  const graph = buildGraph(source);
  if (graph.adj.size === 0) throw new Error(`city ${source.city.id}: no street segments inside the city extent to build routes from`);
  const clock = zoneClock(source.city.timeZone);
  const keep = createExcluder({ ...source.city, exclusionZones: [], depot: { lat: 90, lon: 0 } }, 0);

  const rows: Row[] = [];
  for (let d = startOf(cfg.endDate, cfg.durationMonths); d <= Date.parse(`${cfg.endDate}T00:00:00Z`) / DAY_MS; d++) {
    const date = new Date(d * DAY_MS).toISOString().slice(0, 10);
    const weekend = [0, 6].includes(new Date(d * DAY_MS).getUTCDay());
    const shift = weekend ? D.weekend : D.weekday;
    const from = parseTimestamp(`${date} ${pad(shift.startHour)}:00`, clock)!;
    const to = parseTimestamp(`${date} ${pad(shift.endHour)}:00`, clock)!;
    const dayRows: { time: number; row: Row }[] = [];

    for (let v = 1; v <= (weekend ? D.weekendVehicles : D.vehicles); v++) {
      const vehicle = `PATROL-${pad(v)}`;
      const { ticks, trips } = simulateShift(rng, graph, source, from, to);
      if (format === 'A') {
        let gapUntil = 0;
        for (const t of ticks) {
          if (t.time < gapUntil) continue;
          if (rng.chance(D.gapChance)) {
            gapUntil = t.time + rng.int(D.gapMinutes.min, D.gapMinutes.max) * 60000;
            continue;
          }
          if (rng.chance(D.dropRate)) continue;
          let lat = t.lat + (rng.normal(0, D.jitterMeters / Math.SQRT2)) / M_PER_DEG_LAT;
          let lon = t.lon + rng.normal(0, D.jitterMeters / Math.SQRT2) / (M_PER_DEG_LAT * Math.cos((t.lat * Math.PI) / 180));
          if (keep(lat, lon) === 'Outside city extent') (lat = t.lat), (lon = t.lon);
          dayRows.push({
            time: t.time,
            row: { happenedAtTime: iso(t.time), latitude: lat.toFixed(6), longitude: lon.toFixed(6), vehicle, speedMilesPerHour: t.mph.toFixed(1) },
          });
        }
      } else {
        for (const t of trips) {
          dayRows.push({
            time: t.start.time,
            row: {
              Asset: vehicle,
              'Trip Start Time': iso(t.start.time),
              'Trip Start Location': loc(t.start.lat, t.start.lon),
              'Trip End Time': iso(t.end.time),
              'Trip End Location': loc(t.end.lat, t.end.lon),
              'Distance (mi)': t.miles.toFixed(2),
            },
          });
        }
      }
    }
    dayRows.sort((a, b) => a.time - b.time || a.row[FIELDS[format].vehicle].localeCompare(b.row[FIELDS[format].vehicle]));
    for (const r of dayRows) rows.push(r.row);
  }

  const headers = format === 'A' ? PATROL_A_HEADERS : PATROL_B_HEADERS;
  const result = errors ? inject(rows, format, source, errors, createRng(`${cfg.seed ?? 'inject'}-errors`)) : { rows, injected: undefined };
  const lines = result.rows.map((r) => headers.map((h) => cell(r[h] ?? '')).join(','));
  return {
    csv: [headers.join(','), ...lines].join('\n') + '\n',
    injected: result.injected ?? { badTime: 0, latLonRange: 0, swapped: 0, zeroZero: 0, missingVehicle: 0, duplicate: 0, outsideExtent: 0 },
  };
}

/** Generates a patrol sample as CSV text, ready for the same importer as an upload (FR-41). */
export function generatePatrol(cfg: Partial<SampleConfig>, source: PatrolSource, format: PatrolFormat = 'A', errors?: PatrolInject): string {
  return generatePatrolSample(cfg, source, format, errors).csv;
}
