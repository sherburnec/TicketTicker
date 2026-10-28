import { describe, expect, it } from 'vitest';
import { loadCity } from '../city/loadCity.ts';
import { cityBounds, localStyle } from './style.ts';

const segments = { type: 'FeatureCollection' as const, features: [] };

describe('localStyle', () => {
  const style = localStyle(segments);

  it('has no remote sources: every source is inline GeoJSON', () => {
    for (const source of Object.values(style.sources)) {
      expect(source.type).toBe('geojson');
      expect(typeof (source as { data: unknown }).data).toBe('object');
    }
  });

  it('has no tile, glyph or sprite URLs anywhere', () => {
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(JSON.stringify(style)).not.toMatch(/https?:|\/\/|"tiles"|"url"/);
  });

  it('only draws layers from declared sources', () => {
    for (const layer of style.layers) if ('source' in layer && layer.source) expect(style.sources).toHaveProperty(layer.source);
  });
});

describe('cityBounds', () => {
  it('returns the Burbank extent as west, south, east, north', () => {
    const [w, s, e, n] = cityBounds(loadCity('burbank'));
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
  });
});
