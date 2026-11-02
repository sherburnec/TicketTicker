import type { CityListing } from '../city/registry.ts';
import { el, field, notice } from './dom.ts';

/** What the switcher needs from a mounted dashboard. */
export interface MountedDashboard {
  destroy(): void;
  /** True when citations, patrol data or rate overrides are loaded (AS9). */
  hasData(): boolean;
}

export interface CityApp {
  current(): string;
  /** Switches city, asking first if data is loaded. Returns false if the user cancelled. */
  switchTo(id: string): boolean;
  /** Call when the URL hash changed; the app follows it (AS10). */
  onHashChange(): void;
  destroy(): void;
}

export interface CityAppOptions {
  cities: CityListing[];
  mount(root: HTMLElement, cityId: string, extras: { cityControl?: HTMLElement }): MountedDashboard;
  confirm?: (message: string) => boolean;
  location?: { hash: string };
}

export const SWITCH_WARNING = 'Switching city will discard the loaded citation data, patrol data and rate changes. Continue?';

export const cityHash = (id: string) => `#city=${encodeURIComponent(id)}`;

export function parseCityHash(hash: string): string | undefined {
  const m = /^#city=(.+)$/.exec(hash);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}

/** One dashboard at a time. The selected city is a setting and may live in the URL hash; data never does (NFR-1, AS8–AS10). */
export function mountCityApp(app: HTMLElement, opts: CityAppOptions): CityApp {
  const { cities, mount } = opts;
  const location = opts.location ?? window.location;
  const confirmSwitch = opts.confirm ?? ((m: string) => window.confirm(m));
  let currentId = '';
  let dashboard: MountedDashboard | undefined;

  function select(): HTMLElement | undefined {
    if (cities.length < 2) return undefined;
    const s = el('select');
    for (const c of cities) {
      const o = el('option', c.name);
      o.value = c.id;
      s.append(o);
    }
    s.value = currentId;
    s.addEventListener('change', () => {
      if (!switchTo(s.value)) s.value = currentId;
    });
    const label = field('City', s);
    label.classList.add('city-switcher');
    return label;
  }

  function show(id: string, message?: string): void {
    dashboard?.destroy();
    currentId = id;
    location.hash = cityHash(id);
    dashboard = mount(app, id, { cityControl: select() });
    if (message) app.querySelector('#main')?.prepend(notice(message, 'error'));
  }

  function switchTo(id: string): boolean {
    if (id === currentId) return true;
    if (!cities.some((c) => c.id === id)) return false;
    if (dashboard?.hasData() && !confirmSwitch(SWITCH_WARNING)) return false;
    show(id);
    return true;
  }

  function onHashChange(): void {
    const id = parseCityHash(location.hash);
    if (id === undefined || id === currentId) return;
    if (!switchTo(id)) location.hash = cityHash(currentId);
  }

  const wanted = parseCityHash(location.hash);
  const start = cities.find((c) => c.id === wanted)?.id ?? cities[0].id;
  show(start, wanted !== undefined && wanted !== start ? `City "${wanted}" is not available. Showing ${cities[0].name}.` : undefined);
  window.addEventListener('hashchange', onHashChange);

  return {
    current: () => currentId,
    switchTo,
    onHashChange,
    destroy() {
      window.removeEventListener('hashchange', onHashChange);
      dashboard?.destroy();
    },
  };
}
