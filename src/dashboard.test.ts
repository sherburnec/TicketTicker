// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const maps: { remove: ReturnType<typeof vi.fn> }[] = [];
vi.mock('./map/streetMap.ts', () => ({
  mountStreetMap: vi.fn(() => {
    const m = { remove: vi.fn(), resize: vi.fn(), isStyleLoaded: () => true, once: vi.fn(), on: vi.fn(), getSource: vi.fn(), setPaintProperty: vi.fn() };
    maps.push(m);
    return m;
  }),
  applyMapTheme: vi.fn(),
}));

import { mountDashboard } from './dashboard.ts';
import { createTheme } from './ui/theme.ts';

const text = import.meta.glob('/tests/fixtures/cities/*/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const cities = import.meta.glob('/tests/fixtures/cities/*/city.json', { eager: true, import: 'default' });
const fixtures = { text, cities };

// happy-dom has no Option constructor, which the panels use for select lists.
vi.stubGlobal('Option', function (text: string, value: string) {
  const o = document.createElement('option');
  o.textContent = text;
  o.value = value;
  return o;
});

afterEach(() => {
  document.body.replaceChildren();
  maps.length = 0;
});

describe('mountDashboard', () => {
  it('mounts a city, tears it down, and mounts another with nothing left over', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const theme = createTheme();

    const burbank = mountDashboard(root, 'burbank', theme);
    expect(root.textContent).toContain('Burbank');
    expect(burbank.hasData()).toBe(false);
    expect(root.textContent?.split('© OpenStreetMap contributors').length).toBe(3); // credit under both maps
    expect(maps).toHaveLength(2);
    burbank.destroy();
    expect(root.childNodes).toHaveLength(0);
    expect(root.className).toBe('');
    expect(maps.every((m) => m.remove.mock.calls.length === 1)).toBe(true);

    const testville = mountDashboard(root, 'testville', theme, { files: fixtures });
    expect(root.textContent).toContain('Testville');
    expect(root.textContent).not.toContain('Burbank');
    expect(document.body.textContent).not.toContain('Burbank');
    testville.destroy();
    expect(root.childNodes).toHaveLength(0);
  });

  it('removes its keyboard listener on destroy', () => {
    const root = document.createElement('div');
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    mountDashboard(root, 'burbank', createTheme()).destroy();
    const added = add.mock.calls.filter(([t]) => t === 'keydown').map(([, f]) => f);
    const removed = remove.mock.calls.filter(([t]) => t === 'keydown').map(([, f]) => f);
    expect(added.length).toBeGreaterThan(0);
    for (const f of added) expect(removed).toContain(f);
    add.mockRestore();
    remove.mockRestore();
  });
});
