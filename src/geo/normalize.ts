const TYPES: Record<string, string> = {
  avenue: 'ave', ave: 'ave', boulevard: 'blvd', blvd: 'blvd', drive: 'dr', dr: 'dr', street: 'st', st: 'st',
  place: 'pl', pl: 'pl', road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', way: 'wy', wy: 'wy',
  circle: 'cir', cir: 'cir', terrace: 'ter', ter: 'ter', parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy',
  trail: 'trl', trl: 'trl', alley: 'aly', aly: 'aly', square: 'sq', sq: 'sq', point: 'pt', pt: 'pt',
};
const DIRECTIONS: Record<string, string> = { n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w' };
const ORDINALS: Record<string, string> = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th',
  seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th',
};
const UNIT_WORDS = new Set(['apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building', 'fl', 'floor', 'rm', 'room', 'spc', 'space', 'lot']);

export interface Street {
  /** "n", "s", "e" or "w" before the name, or "". */
  preDir: string;
  /** Lower case, spelled-out ordinals as digits ("fifth" gives "5th"). */
  name: string;
  /** Canonical abbreviation ("blvd"), or "" when the street names no type. */
  type: string;
  /** Direction after the type ("chandler blvd south"), or "". */
  postDir: string;
}

export interface Address extends Street {
  /** The house number, or null when the address has none. */
  number: number | null;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/#/g, ' ').split(/\s+/).filter(Boolean);

/** Parses a street name ("W Chandler Blvd", "West Chandler Boulevard South") with no house number. */
export function normalizeStreet(raw: string): Street {
  const tokens = words(raw.replace(/#.*$/, ''));
  let preDir = '';
  if (tokens.length > 1 && DIRECTIONS[tokens[0]]) preDir = DIRECTIONS[tokens.shift()!];
  // A type word is the street's type only after at least one name word, so "Court St" and "Way St" keep their names.
  const typeAt = tokens.findIndex((t, i) => i >= 1 && TYPES[t] !== undefined);
  if (typeAt < 0) {
    const postDir = tokens.length > 1 && DIRECTIONS[tokens[tokens.length - 1]] ? DIRECTIONS[tokens.pop()!] : '';
    return { preDir, name: tokens.map((t) => ORDINALS[t] ?? t).join(' '), type: '', postDir };
  }
  const after = tokens[typeAt + 1];
  return {
    preDir,
    name: tokens.slice(0, typeAt).map((t) => ORDINALS[t] ?? t).join(' '),
    type: TYPES[tokens[typeAt]],
    postDir: after && DIRECTIONS[after] ? DIRECTIONS[after] : '',
  };
}

/** The street's name and type with direction left out, for pairing addresses with segments that omit a direction. */
export function streetKey(raw: string): string {
  const s = normalizeStreet(raw);
  return `${s.name} ${s.type}`.trim();
}

/**
 * Normalizes a full address ("1800 W Empire Ave", "1800 west empire avenue, Burbank CA 91504", "1800 W. Empire Ave Apt 3").
 * Case, punctuation, street-type and direction spellings, unit designators and anything after the street are removed.
 */
export function normalizeAddress(raw: string): Address {
  let tokens = words(raw.replace(/#.*$/, ''));
  const unitAt = tokens.findIndex((t, i) => i >= 2 && UNIT_WORDS.has(t));
  if (unitAt >= 0) tokens = tokens.slice(0, unitAt);
  let number: number | null = null;
  const m = /^(\d+)[a-z]?$/.exec(tokens[0] ?? '');
  if (m) {
    number = Number(m[1]);
    tokens.shift();
  }
  const street = normalizeStreet(tokens.join(' '));
  return { number, ...street };
}

/** One string per address for exact comparison, e.g. "1800 w empire ave". */
export function addressKey(a: Address): string {
  return [a.number ?? '', a.preDir, a.name, a.type, a.postDir].filter((p) => p !== '').join(' ');
}
