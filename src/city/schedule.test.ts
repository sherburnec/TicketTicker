import { describe, expect, it } from 'vitest';
import { codeSource, parseCsv, parseFineSchedule, parseNamedLocations, resolveFine } from './schedule.ts';
import burbankSchedule from '../../data/burbank/fine-schedule.csv?raw';
import burbankLocations from '../../data/burbank/named-locations.csv?raw';
import burbankTemplate from '../../data/burbank/named-locations.template.csv?raw';

const HEAD = 'citation_code,citation_name,base_amount,escalated_amount,start_date,escalation_days,sample_weight\n';

describe('parseFineSchedule', () => {
  it('reads the Burbank schedule', () => {
    const entries = parseFineSchedule(burbankSchedule);
    expect(entries.map((e) => e.code)).toEqual(['CVC-22500(g)', 'BMC-6-1', 'BMC-ART30']);
    expect(entries[0]).toMatchObject({ name: 'Street sweeping', base: 75, escalated: 100, sampleWeight: 76 });
    expect(entries[0].startDate).toBeUndefined();
  });

  it('rejects two blank-start rows for one code', () => {
    const csv = `${HEAD}BMC-1,Meter,55,80,,,\nBMC-1,Meter,65,90,,,\n`;
    expect(() => parseFineSchedule(csv)).toThrow(/line 3: BMC-1 already has a row with a blank start date/);
  });

  it('rejects a repeated start date, bad dates, bad numbers and missing columns', () => {
    expect(() => parseFineSchedule(`${HEAD}A-1,A,5,6,2026-07-01,,\nA-1,A,7,8,2026-07-01,,\n`)).toThrow(/already has a row starting 2026-07-01/);
    expect(() => parseFineSchedule(`${HEAD}A-1,A,5,6,7/1/26,,\n`)).toThrow(/ISO date/);
    expect(() => parseFineSchedule(`${HEAD}A-1,A,five,6,,,\n`)).toThrow(/base_amount must be a number/);
    expect(() => parseFineSchedule('citation_code,citation_name\nA-1,A\n')).toThrow(/missing column base_amount/);
  });

  it('reads optional fields', () => {
    const [e] = parseFineSchedule(`${HEAD}A-1,A,5,6,2026-07-01,30,2\n`);
    expect(e).toEqual({ code: 'A-1', name: 'A', base: 5, escalated: 6, startDate: '2026-07-01', escalationDays: 30, sampleWeight: 2 });
  });
});

describe('resolveFine', () => {
  const entries = parseFineSchedule(`${HEAD}BMC-1,Meter,55,80,,,\nBMC-1,Meter,65,90,2026-07-01,,\nBMC-2,Later,10,20,2027-01-01,,\n`);

  it('applies $55 before the increase and $65 from its start date', () => {
    expect(resolveFine(entries, 'BMC-1', '2026-06-30')?.base).toBe(55);
    expect(resolveFine(entries, 'BMC-1', '2026-07-01')?.base).toBe(65);
    expect(resolveFine(entries, 'BMC-1', '2026-08-04')?.base).toBe(65);
    expect(resolveFine(entries, 'BMC-1', '2020-01-01')?.base).toBe(55);
  });

  it('returns nothing for an unknown code or a date before the only row starts', () => {
    expect(resolveFine(entries, 'NOPE-1', '2026-08-04')).toBeUndefined();
    expect(resolveFine(entries, 'BMC-2', '2026-12-31')).toBeUndefined();
  });
});

describe('codeSource', () => {
  it('is the prefix before the dash', () => {
    expect(codeSource('CVC-22500(g)')).toBe('CVC');
    expect(codeSource('BMC-ART30')).toBe('BMC');
    expect(codeSource('LOCAL')).toBe('LOCAL');
  });
});

describe('parseNamedLocations', () => {
  it('groups several addresses under one location id', () => {
    const locs = parseNamedLocations(burbankTemplate);
    expect(locs).toHaveLength(2);
    expect(locs[0]).toMatchObject({ id: 'EXAMPLE-1', name: 'Empire Center', addresses: ['1800 W Empire Ave', '1301 N Victory Pl'], notes: 'Target Burbank.' });
    expect(locs[0].lat).toBeUndefined();
  });

  it('reads the empty Burbank file and coordinates', () => {
    expect(parseNamedLocations(burbankLocations)).toEqual([]);
    const [l] = parseNamedLocations('location_id,location_name,address,latitude,longitude,notes\nX,Mall,1 Main St,34.18,-118.3,\n');
    expect(l).toMatchObject({ lat: 34.18, lon: -118.3 });
  });

  it('rejects half a coordinate, a renamed id and a missing address', () => {
    const head = 'location_id,location_name,address,latitude,longitude,notes\n';
    expect(() => parseNamedLocations(`${head}X,Mall,1 Main St,34.18,,\n`)).toThrow(/both be set/);
    expect(() => parseNamedLocations(`${head}X,Mall,1 Main St,,,\nX,Other,2 Main St,,,\n`)).toThrow(/is named "Mall"/);
    expect(() => parseNamedLocations(`${head}X,Mall,,,,\n`)).toThrow(/address is required/);
  });
});

describe('parseCsv', () => {
  it('handles quotes, commas, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","d ""q"""\r\n1,2,3\r\n')).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
  });
});
