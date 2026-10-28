import type { NamedLocation } from '../types.ts';
import { addressKey, normalizeAddress, normalizeStreet, streetKey } from './normalize.ts';

/** One street block: a row of blocks.csv joined to its segment's street name. `id` is the segment id. */
export interface BlockInfo {
  id: string;
  street: string;
  /** A multiple of 100, or null when not known (such blocks never match). */
  blockNumber: number | null;
  lowAddress: number | null;
  highAddress: number | null;
}

export interface MatchIndex {
  blocksByStreet: Map<string, BlockInfo[]>;
  namedByAddress: Map<string, string>;
}

export interface Match {
  blockId?: string;
  namedLocationId?: string;
}

export function buildMatchIndex(blocks: BlockInfo[], namedLocations: NamedLocation[]): MatchIndex {
  const blocksByStreet = new Map<string, BlockInfo[]>();
  for (const b of blocks) {
    if (b.blockNumber === null) continue;
    const key = streetKey(b.street);
    blocksByStreet.set(key, [...(blocksByStreet.get(key) ?? []), b]);
  }
  const namedByAddress = new Map<string, string>();
  for (const loc of namedLocations) for (const a of loc.addresses) namedByAddress.set(addressKey(normalizeAddress(a)), loc.id);
  return { blocksByStreet, namedByAddress };
}

/**
 * Finds the named location (FR-12a) and the street block (FR-10) for an address. Both can apply.
 * A block matches on street name and type plus the address's hundred. When several blocks share them, the address's
 * direction and then the block's address range narrow the choice; if that still leaves more than one, nothing matches
 * (a block is never guessed).
 */
export function matchAddress(address: string, index: MatchIndex): Match {
  const a = normalizeAddress(address);
  const match: Match = {};
  const named = index.namedByAddress.get(addressKey(a));
  if (named !== undefined) match.namedLocationId = named;
  if (a.number === null) return match;

  const hundred = Math.floor(a.number / 100) * 100;
  let found = (index.blocksByStreet.get(`${a.name} ${a.type}`.trim()) ?? []).filter((b) => b.blockNumber === hundred);
  if (found.length > 1 && a.preDir) {
    const sameDir = found.filter((b) => normalizeStreet(b.street).preDir === a.preDir);
    if (sameDir.length > 0) found = sameDir;
  }
  if (found.length > 1) {
    const inRange = found.filter((b) => b.lowAddress !== null && b.highAddress !== null && a.number! >= b.lowAddress && a.number! <= b.highAddress);
    if (inRange.length > 0) found = inRange;
  }
  if (found.length === 1) match.blockId = found[0].id;
  return match;
}
