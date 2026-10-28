const QUARTER_HOUR = 15 * 60 * 1000;
const DAY = 86400000;

/** Converts instants to wall-clock parts in one IANA zone, daylight saving included (FR-33). */
export interface ZoneClock {
  zone: string;
  /** Offset from UTC in milliseconds at the instant (positive east of Greenwich). */
  offsetMs(t: number): number;
  /** Local calendar day as days since 1970-01-01, local hour 0-23 and day of week (0 = Sunday). */
  local(t: number): { day: number; hour: number; dow: number };
}

/** Throws a RangeError for an unknown zone. */
export function zoneClock(zone: string): ZoneClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const cache = new Map<number, number>();
  const offsetMs = (t: number): number => {
    const bucket = Math.floor(t / QUARTER_HOUR);
    let off = cache.get(bucket);
    if (off === undefined) {
      const at = bucket * QUARTER_HOUR;
      const p: Record<string, number> = {};
      for (const part of fmt.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
      off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
      cache.set(bucket, off);
    }
    return off;
  };
  return {
    zone,
    offsetMs,
    local(t) {
      const wall = t + offsetMs(t);
      const day = Math.floor(wall / DAY);
      return { day, hour: Math.floor((wall - day * DAY) / 3600000), dow: (((day + 4) % 7) + 7) % 7 };
    },
  };
}

/** ISO date (YYYY-MM-DD) of a local day number from `ZoneClock.local`. */
export function isoDate(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

/**
 * The UTC instant of a wall-clock time in the zone. A time repeated when clocks fall back takes its first
 * occurrence; a time skipped when clocks spring forward is read with the offset in force before the change.
 */
function wallToInstant(wallMs: number, clock: ZoneClock): number {
  const before = clock.offsetMs(wallMs - DAY);
  const after = clock.offsetMs(wallMs + DAY);
  const candidates = [...new Set([before, after])].map((o) => wallMs - o).filter((t) => t + clock.offsetMs(t) === wallMs);
  return candidates.length > 0 ? Math.min(...candidates) : wallMs - before;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i;

function wall(y: number, mo: number, d: number, h: number, mi: number, s: number, ms = 0): number | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return undefined;
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  return new Date(t).getUTCDate() === d ? t : undefined;
}

/**
 * Epoch milliseconds for a timestamp cell, or undefined when it cannot be read (DR-13). Accepts ISO 8601 with Z or an
 * offset, Unix epoch seconds or milliseconds, and times with no zone marker (ISO or M/D/YYYY h:mm AM), which are
 * read in the clock's zone (FR-33).
 */
export function parseTimestamp(raw: string, clock: ZoneClock): number | undefined {
  const text = raw.trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (n >= 1e9 && n < 1e11) return Math.round(n * 1000);
    return n >= 1e11 && n < 1e14 ? Math.round(n) : undefined;
  }
  const iso = ISO.exec(text);
  if (iso) {
    const w = wall(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0), iso[7] ? +iso[7].padEnd(3, '0') : 0);
    if (w === undefined) return undefined;
    const marker = iso[8];
    if (!marker) return wallToInstant(w, clock);
    if (marker.toUpperCase() === 'Z') return w;
    const sign = marker[0] === '-' ? -1 : 1;
    const digits = marker.slice(1).replace(':', '');
    return w - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0)) * 60000;
  }
  const us = US.exec(text);
  if (us) {
    let h = +us[4];
    if (us[7]) {
      if (h < 1 || h > 12) return undefined;
      h = (h % 12) + (us[7].toUpperCase() === 'PM' ? 12 : 0);
    }
    const w = wall(+us[3], +us[1], +us[2], h, +us[5], +(us[6] ?? 0));
    return w === undefined ? undefined : wallToInstant(w, clock);
  }
  return undefined;
}
