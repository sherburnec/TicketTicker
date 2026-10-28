import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';
import { DEFAULT_SAMPLE_CONFIG, sampleConfig } from './config.ts';

const run = (seed: string | number) => {
  const r = createRng(seed);
  return JSON.stringify([r.next(), r.int(1, 100), r.chance(0.5), r.pick(['a', 'b', 'c']), r.weighted([1, 2, 3], (x) => x), r.normal(0, 1)]);
};

describe('createRng', () => {
  it('gives byte-identical output for the same seed', () => {
    expect(run(42)).toBe(run(42));
    expect(run('abc')).toBe(run('abc'));
  });

  it('differs between seeds and stays in range', () => {
    expect(run(1)).not.toBe(run(2));
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.next();
      expect(n >= 0 && n < 1).toBe(true);
      expect([1, 2, 3]).toContain(r.int(1, 3));
    }
  });

  it('honours weights', () => {
    const r = createRng(3);
    let heavy = 0;
    for (let i = 0; i < 2000; i++) if (r.weighted(['h', 'l'], (x) => (x === 'h' ? 9 : 1)) === 'h') heavy++;
    expect(heavy / 2000).toBeGreaterThan(0.85);
  });
});

describe('sampleConfig', () => {
  it('defaults to one month and merges overrides', () => {
    expect(DEFAULT_SAMPLE_CONFIG.durationMonths).toBe(1);
    expect(sampleConfig({ durationMonths: 36 })).toMatchObject({ durationMonths: 36, citationsPerDay: 200 });
  });
});
