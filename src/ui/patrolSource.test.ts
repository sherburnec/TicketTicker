import { describe, expect, it } from 'vitest';
import { createPatrolStore, samplePatrol, uploadedPatrol } from './patrolSource.ts';
import { loadCitySource, loadSegments } from './sourcePanel.ts';

describe('patrol source', () => {
  it('starts as none and can be set and cleared', () => {
    const s = createPatrolStore();
    expect(s.get()).toBeUndefined();
    s.set({ csv: 'a,b\n1,2\n', label: 'Upload: x.csv' });
    expect(s.get()?.label).toBe('Upload: x.csv');
    s.clear();
    expect(s.get()).toBeUndefined();
  });

  it('loads an uploaded CSV as-is and rejects an empty one', async () => {
    expect(await uploadedPatrol(new File(['a,b\n1,2\n'], 'p.csv'))).toEqual({ csv: 'a,b\n1,2\n', label: 'Upload: p.csv' });
    await expect(uploadedPatrol(new File([' \n'], 'e.csv'))).rejects.toThrow('empty');
  });
});

describe('patrol sample source', () => {
  const source = { city: loadCitySource('burbank').city, segments: loadSegments('burbank') };

  it('labels the sample with format, duration and seed, and is reproducible for a seed', () => {
    const a = samplePatrol(source, { format: 'A', months: 1, seed: 'x', injectErrors: false });
    expect(a.label).toBe('Sample patrol data, Format A, 1 month, seed x');
    expect(samplePatrol(source, { format: 'A', months: 1, seed: 'x', injectErrors: false }).csv).toBe(a.csv);
  });

  it('rejects an invalid duration', () => {
    expect(() => samplePatrol(source, { format: 'A', months: 0, injectErrors: false })).toThrow('months');
  });
});
