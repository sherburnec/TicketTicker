import { describe, expect, it } from 'vitest';
import {
  assignAddresses,
  blockNumberFor,
  mergeBlockRows,
  parseBlockRows,
  renderReport,
  serializeBlockRows,
  streetKey,
  summariseSegments,
  type Address,
  type Segment,
} from './build-blocks.ts';

const LAT = 34.18;
const lonOf = (i: number) => -118.4 + i * 0.002; // about 185 m apart, beyond the 40 m match distance

/** A hundred consecutive blocks of one street: block i runs from i*100 to i*100+99. */
function hundredBlocks(): { segments: Segment[]; addresses: Address[] } {
  const segments: Segment[] = [];
  const addresses: Address[] = [];
  for (let i = 0; i < 100; i++) {
    segments.push({
      segment_id: `s${i}`,
      street: 'West Olive Avenue',
      coordinates: [[lonOf(i), LAT], [lonOf(i) + 0.001, LAT]],
    });
    for (const offset of [5, 42, 99]) {
      addresses.push({ housenumber: i * 100 + offset, street: 'W Olive Ave', lat: LAT + 0.0001, lon: lonOf(i) + 0.0005 });
    }
  }
  return { segments, addresses };
}

describe('hundred-block derivation', () => {
  it('derives the right block number for a hundred blocks', () => {
    const { segments, addresses } = hundredBlocks();
    const rows = summariseSegments(segments.map((s) => s.segment_id), assignAddresses(addresses, segments));
    expect(rows).toHaveLength(100);
    rows.forEach((r, i) => {
      expect(r.block_number).toBe(i * 100);
      expect(r.low_address).toBe(i * 100 + 5);
      expect(r.high_address).toBe(i * 100 + 99);
    });
  });

  it('never guesses: one address, or two hundreds, gives no number', () => {
    expect(blockNumberFor([])).toBeNull();
    expect(blockNumberFor([412])).toBeNull();
    expect(blockNumberFor([399, 401])).toBeNull();
    expect(blockNumberFor([400, 499])).toBe(400);
  });

  it('ignores addresses on another street or too far from the segment', () => {
    const { segments, addresses } = hundredBlocks();
    const stray: Address[] = [
      { housenumber: 9000, street: 'N Hollywood Way', lat: LAT + 0.0001, lon: lonOf(0) + 0.0005 },
      { housenumber: 9100, street: 'W Olive Ave', lat: LAT + 0.01, lon: lonOf(0) + 0.0005 },
    ];
    const found = assignAddresses([...addresses, ...stray], segments);
    expect(found.get('s0')).toEqual([5, 42, 99]);
  });
});

describe('streetKey', () => {
  it('treats case, abbreviations and direction words as the same street', () => {
    expect(streetKey('W Chandler Blvd')).toBe(streetKey('West Chandler Boulevard South'));
    expect(streetKey('N Hollywood Wy')).toBe(streetKey('North Hollywood Way'));
    expect(streetKey('S 1st St')).toBe(streetKey('South First Street'));
    expect(streetKey('Olive Ave')).not.toBe(streetKey('Olive St'));
  });
});

describe('blocks.csv', () => {
  it('round-trips and keeps manual rows on a re-run', () => {
    const fresh = summariseSegments(['a', 'b'], new Map([['a', [110, 150]]]));
    const manual = parseBlockRows('segment_id,block_number,low_address,high_address,source\nb,700,,,manual\n');
    const merged = mergeBlockRows(manual, fresh);
    expect(merged.find((r) => r.segment_id === 'b')).toMatchObject({ block_number: 700, source: 'manual' });
    expect(parseBlockRows(serializeBlockRows(merged))).toEqual(merged);
  });

  it('lists every block that lacks a number, with the reason', () => {
    const rows = summariseSegments(['a', 'b', 'c', 'd'], new Map([['a', [110, 150]], ['b', [110]], ['c', [199, 201]]]));
    const report = renderReport('x', rows, new Map([['b', 'Oak St'], ['c', 'Elm St'], ['d', 'Pine St']]));
    expect(report).toContain('| b | Oak St | only 1 address found |');
    expect(report).toContain('| c | Elm St | addresses 199 to 201 are in different hundreds |');
    expect(report).toContain('| d | Pine St | no address found |');
    expect(report).not.toContain('| a |');
  });
});
