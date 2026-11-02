import { describe, expect, it } from 'vitest';
import { buildMatchIndex, matchAddress, type BlockInfo } from './matcher.ts';
import { addressKey, normalizeAddress, streetKey } from './normalize.ts';
import type { NamedLocation } from '../types.ts';

const key = (s: string) => addressKey(normalizeAddress(s));

describe('normalizeAddress', () => {
  it('ignores case and punctuation', () => {
    expect(key('1800 W. EMPIRE AVE.')).toBe('1800 w empire ave');
    expect(key('1800 w empire ave')).toBe('1800 w empire ave');
  });

  it('treats street-type abbreviations and full words alike', () => {
    expect(key('1800 W Empire Avenue')).toBe(key('1800 W Empire Ave'));
    expect(key('1301 N Victory Place')).toBe(key('1301 N Victory Pl'));
    expect(key('3219 W Chandler Boulevard')).toBe(key('3219 W Chandler Blvd'));
    expect(key('1624 N Hollywood Way')).toBe(key('1624 N Hollywood Wy'));
  });

  it('treats direction abbreviations and full words alike, before and after the type', () => {
    expect(key('1800 West Empire Ave')).toBe(key('1800 W Empire Ave'));
    expect(key('3219 W Chandler Blvd South')).toBe(key('3219 West Chandler Boulevard S'));
    expect(key('3219 W Chandler Blvd South')).not.toBe(key('3219 W Chandler Blvd North'));
  });

  it('drops units, city, state and zip', () => {
    expect(key('1800 W Empire Ave Apt 3')).toBe('1800 w empire ave');
    expect(key('1800 W Empire Ave #12')).toBe('1800 w empire ave');
    expect(key('1800 W Empire Ave, Burbank, CA 91504')).toBe('1800 w empire ave');
  });

  it('keeps street names that contain type or direction words', () => {
    expect(normalizeAddress('120 Court St')).toMatchObject({ name: 'court', type: 'st' });
    expect(normalizeAddress('144 S First St')).toMatchObject({ preDir: 's', name: '1st', type: 'st' });
    expect(normalizeAddress('144 S 1st St')).toEqual(normalizeAddress('144 South First Street'));
  });

  it('reads no house number as null', () => {
    expect(normalizeAddress('Victory Blvd').number).toBeNull();
  });

  it('gives street keys that ignore direction', () => {
    expect(streetKey('West Chandler Boulevard South')).toBe('chandler blvd');
  });
});

describe('matchAddress', () => {
  const blocks: BlockInfo[] = [
    { id: 'olive-1800', street: 'West Olive Avenue', blockNumber: 1800, lowAddress: 1801, highAddress: 1899 },
    { id: 'glen-n-1200', street: 'North Glenoaks Boulevard', blockNumber: 1200, lowAddress: 1205, highAddress: 1290 },
    { id: 'glen-s-1200', street: 'South Glenoaks Boulevard', blockNumber: 1200, lowAddress: 1210, highAddress: 1280 },
    { id: 'reese', street: 'Reese Place', blockNumber: 1000, lowAddress: 1001, highAddress: 1050 },
    { id: 'unnumbered', street: 'Pine Street', blockNumber: null, lowAddress: null, highAddress: null },
    { id: 'pine-300a', street: 'Pine Street', blockNumber: 300, lowAddress: 301, highAddress: 340 },
    { id: 'pine-300b', street: 'Pine Street', blockNumber: 300, lowAddress: 341, highAddress: 399 },
  ];
  const named: NamedLocation[] = [
    { id: 'EMP', name: 'Empire Center', addresses: ['1800 W Empire Ave', '1301 N Victory Pl'] },
    { id: 'OLV', name: 'Olive Plaza', addresses: ['1850 W Olive Ave'] },
  ];
  const index = buildMatchIndex(blocks, named);

  it('matches case, street-type and direction variants to the same block', () => {
    for (const a of ['1850 W Olive Ave', '1850 west olive avenue', '1850 W. OLIVE AVE.', '1850 Olive Avenue', '1850 W Olive Ave Apt 4'])
      expect(matchAddress(a, index).blockId).toBe('olive-1800');
  });

  it('uses the direction to separate North and South streets sharing a hundred', () => {
    expect(matchAddress('1250 N Glenoaks Blvd', index).blockId).toBe('glen-n-1200');
    expect(matchAddress('1250 S Glenoaks Blvd', index).blockId).toBe('glen-s-1200');
  });

  it('matches a block whose segment street has no direction', () => {
    expect(matchAddress('1020 N Reese Pl', index).blockId).toBe('reese');
  });

  it('uses the address range when blocks share street and hundred, and refuses when it cannot decide', () => {
    expect(matchAddress('310 Pine St', index).blockId).toBe('pine-300a');
    expect(matchAddress('360 Pine St', index).blockId).toBe('pine-300b');
    expect(matchAddress('300 Pine St', index).blockId).toBeUndefined();
  });

  it('does not match a missing hundred, an unknown street or a missing number', () => {
    expect(matchAddress('2950 W Olive Ave', index)).toEqual({});
    expect(matchAddress('1850 W Nowhere Ave', index)).toEqual({});
    expect(matchAddress('Olive Ave', index)).toEqual({});
  });

  it('matches every address of a multi-address named location, in any spelling', () => {
    expect(matchAddress('1800 West Empire Avenue', index).namedLocationId).toBe('EMP');
    expect(matchAddress('1301 N. VICTORY PLACE', index).namedLocationId).toBe('EMP');
    expect(matchAddress('1301 N Victory Pl Ste 5', index).namedLocationId).toBe('EMP');
    expect(matchAddress('1302 N Victory Pl', index).namedLocationId).toBeUndefined();
  });

  it('can return both a named location and its block', () => {
    expect(matchAddress('1850 W Olive Ave', index)).toEqual({ blockId: 'olive-1800', namedLocationId: 'OLV' });
  });
});

describe('Malibu address forms', () => {
  it('treats Pacific Coast Hwy, Highway and PCH alike', () => {
    expect(key('23250 Pacific Coast Hwy')).toBe('23250 pacific coast hwy');
    expect(key('23250 Pacific Coast Highway')).toBe(key('23250 Pacific Coast Hwy'));
    expect(key('23250 PCH')).toBe(key('23250 Pacific Coast Hwy'));
    expect(key('23250 P.C.H.')).toBe(key('23250 Pacific Coast Hwy'));
    expect(streetKey('PCH')).toBe(streetKey('Pacific Coast Highway'));
  });

  it('treats Malibu Canyon Rd and Road alike', () => {
    expect(key('3900 Malibu Canyon Rd')).toBe(key('3900 Malibu Canyon Road'));
  });

  it('reads five-digit house numbers', () => {
    expect(normalizeAddress('23250 Pacific Coast Hwy')).toMatchObject({ number: 23250, name: 'pacific coast', type: 'hwy' });
  });

  it('drops the trailing city, state and ZIP', () => {
    expect(key('23250 Pacific Coast Hwy, Malibu, CA 90265')).toBe('23250 pacific coast hwy');
    expect(key('23250 Pacific Coast Hwy Malibu CA')).toBe('23250 pacific coast hwy');
    expect(key('3900 Malibu Canyon Rd Malibu CA 90265')).toBe('3900 malibu canyon rd');
    expect(key('23250 Pacific Coast Hwy Ste 100')).toBe('23250 pacific coast hwy');
  });

  it('matches a five-digit address to its hundred block on a named street shared by many segments', () => {
    const blocks: BlockInfo[] = [
      { id: 'pch-23200', street: 'Pacific Coast Highway', blockNumber: 23200, lowAddress: 23201, highAddress: 23280 },
      { id: 'pch-23300', street: 'Pacific Coast Highway', blockNumber: 23300, lowAddress: 23301, highAddress: 23380 },
    ];
    const index = buildMatchIndex(blocks, [{ id: 'MAL-1', name: 'Pier', addresses: ['23000 PCH'] }]);
    expect(matchAddress('23250 PCH, Malibu CA 90265', index).blockId).toBe('pch-23200');
    expect(matchAddress('23350 Pacific Coast Hwy', index).blockId).toBe('pch-23300');
    expect(matchAddress('23000 Pacific Coast Highway', index).namedLocationId).toBe('MAL-1');
  });
});
