import { describe, expect, it } from 'vitest';
import { createPatrolStore, uploadedPatrol } from './patrolSource.ts';

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
