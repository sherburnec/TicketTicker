// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./map/streetMap.ts', () => ({
  mountStreetMap: vi.fn(() => ({ remove: vi.fn(), resize: vi.fn(), isStyleLoaded: () => true, once: vi.fn(), on: vi.fn(), getSource: vi.fn(), setPaintProperty: vi.fn() })),
  applyMapTheme: vi.fn(),
}));
// happy-dom has no Option constructor, which the panels use for select lists.
vi.stubGlobal('Option', function (text: string, value: string) {
  const o = document.createElement('option');
  o.textContent = text;
  o.value = value;
  return o;
});

import { listCities } from './city/registry.ts';
import { mountDashboard } from './dashboard.ts';
import { mountCityApp } from './ui/citySwitcher.ts';
import { createTheme } from './ui/theme.ts';

afterEach(() => document.body.replaceChildren());

describe('the real dashboard with the bundled cities', () => {
  it('moves between Burbank and Malibu and shows no other city outside the selector', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const theme = createTheme();
    const confirm = vi.fn(() => false);
    const location = { hash: '' };
    mountCityApp(root, { cities: listCities(), location, confirm, mount: (r, id, extras) => mountDashboard(r, id, theme, extras) });

    const page = () => (root.querySelector('main')?.textContent ?? '') + (root.querySelector('.brand span')?.textContent ?? '');
    const select = () => root.querySelector('select[name], .city-switcher select') as HTMLSelectElement;
    expect([...select().options].map((o) => o.textContent)).toEqual(['Burbank, CA', 'Malibu, CA']);
    expect(location.hash).toBe('#city=burbank');
    expect(page()).toContain('No citation data loaded');

    select().value = 'malibu';
    select().dispatchEvent(new Event('change'));
    expect(location.hash).toBe('#city=malibu');
    expect(page()).toContain('Malibu, CA');
    expect(page()).not.toContain('Burbank');
    expect(confirm).not.toHaveBeenCalled();

    select().value = 'burbank';
    select().dispatchEvent(new Event('change'));
    expect(page()).toContain('Burbank, CA');
    expect(page()).not.toContain('Malibu');
  });
});
