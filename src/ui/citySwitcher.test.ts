// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { cityHash, mountCityApp, parseCityHash } from './citySwitcher.ts';
import type { MountedDashboard } from './citySwitcher.ts';

const cities = [{ id: 'alpha', name: 'Alpha, CA' }, { id: 'beta', name: 'Beta, CA' }];

function setup(opts: { hash?: string; list?: typeof cities; confirm?: (m: string) => boolean } = {}) {
  const app = document.createElement('div');
  const location = { hash: opts.hash ?? '' };
  const state = { loaded: false };
  const mounted: string[] = [];
  const destroyed: string[] = [];
  const confirm = vi.fn(opts.confirm ?? (() => true));
  const city = mountCityApp(app, {
    cities: opts.list ?? cities,
    location,
    confirm,
    mount: (root, id, { cityControl }): MountedDashboard => {
      mounted.push(id);
      const page = document.createElement('main');
      page.id = 'main';
      page.textContent = `Dashboard ${id}`;
      root.replaceChildren(...(cityControl ? [cityControl] : []), page);
      return { destroy: () => { destroyed.push(id); root.replaceChildren(); }, hasData: () => state.loaded };
    },
  });
  const select = () => app.querySelector('select') as HTMLSelectElement | null;
  const choose = (id: string) => {
    select()!.value = id;
    select()!.dispatchEvent(new Event('change'));
  };
  return { app, location, state, mounted, destroyed, confirm, city, select, choose };
}

describe('city hash', () => {
  it('round trips', () => {
    expect(cityHash('malibu')).toBe('#city=malibu');
    expect(parseCityHash('#city=malibu')).toBe('malibu');
    expect(parseCityHash('#citations')).toBeUndefined();
    expect(parseCityHash('')).toBeUndefined();
    expect(parseCityHash(cityHash('a b'))).toBe('a b');
  });
});

describe('city switcher', () => {
  it('starts on the first city, writes it to the hash and offers a labelled selector', () => {
    const t = setup();
    expect(t.mounted).toEqual(['alpha']);
    expect(t.location.hash).toBe('#city=alpha');
    expect(t.app.querySelector('label')?.textContent).toContain('City');
    expect([...t.select()!.options].map((o) => o.textContent)).toEqual(['Alpha, CA', 'Beta, CA']);
  });

  it('starts on the city in the hash', () => {
    const t = setup({ hash: '#city=beta' });
    expect(t.mounted).toEqual(['beta']);
    expect(t.select()!.value).toBe('beta');
  });

  it('falls back to the first city with a visible notice for an unknown id', () => {
    const t = setup({ hash: '#city=atlantis' });
    expect(t.mounted).toEqual(['alpha']);
    expect(t.location.hash).toBe('#city=alpha');
    expect(t.app.textContent).toMatch(/atlantis.*not available/i);
  });

  it('hides the selector when only one city exists', () => {
    const t = setup({ list: [cities[0]] });
    expect(t.select()).toBeNull();
  });

  it('switches without asking when nothing is loaded', () => {
    const t = setup();
    t.choose('beta');
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.destroyed).toEqual(['alpha']);
    expect(t.mounted).toEqual(['alpha', 'beta']);
    expect(t.location.hash).toBe('#city=beta');
    expect(t.app.textContent).toContain('Dashboard beta');
  });

  it('asks first when data is loaded, then resets', () => {
    const t = setup();
    t.state.loaded = true;
    t.choose('beta');
    expect(t.confirm).toHaveBeenCalledTimes(1);
    expect(t.confirm.mock.calls[0][0]).toMatch(/discard/i);
    expect(t.mounted).toEqual(['alpha', 'beta']);
  });

  it('keeps the data and the selection when the user cancels', () => {
    const t = setup({ confirm: () => false });
    t.state.loaded = true;
    t.choose('beta');
    expect(t.destroyed).toEqual([]);
    expect(t.mounted).toEqual(['alpha']);
    expect(t.select()!.value).toBe('alpha');
    expect(t.location.hash).toBe('#city=alpha');
  });

  it('follows the hash when it changes, and restores it on cancel', () => {
    const t = setup();
    t.location.hash = '#city=beta';
    t.city.onHashChange();
    expect(t.mounted).toEqual(['alpha', 'beta']);
    const c = setup({ confirm: () => false });
    c.state.loaded = true;
    c.location.hash = '#city=beta';
    c.city.onHashChange();
    expect(c.mounted).toEqual(['alpha']);
    expect(c.location.hash).toBe('#city=alpha');
  });
});
