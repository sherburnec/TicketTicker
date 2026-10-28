import { el } from './dom.ts';
import { themeToggle, type createTheme } from './theme.ts';

export type ViewId = 'citations' | 'patrol';

export interface SectionSpec {
  id: string;
  /** Plain-language name shown in the navigation. */
  nav: string;
}

const VIEWS: { id: ViewId; title: string; blurb: string; sections: SectionSpec[] }[] = [
  {
    id: 'citations',
    title: 'Citations',
    blurb: 'Revenue, hotspots and the city report',
    sections: [
      { id: 'citation-data', nav: 'Load data' },
      { id: 'import-summary', nav: 'Import summary' },
      { id: 'revenue', nav: 'Revenue and rates' },
      { id: 'hotspots', nav: 'Busiest blocks' },
      { id: 'officers', nav: 'Officer activity' },
      { id: 'locations', nav: 'Location history' },
      { id: 'city-pdf', nav: 'City report (PDF)' },
    ],
  },
  {
    id: 'patrol',
    title: 'Patrol',
    blurb: 'Internal only: vehicle presence',
    sections: [
      { id: 'patrol-data', nav: 'Load data' },
      { id: 'patrol-import', nav: 'Import summary' },
      { id: 'patrol-heatmap', nav: 'Patrol heatmap' },
    ],
  },
];

export interface Shell {
  /** Container for each section, keyed by section id. */
  sections: Record<string, HTMLElement>;
  show(view: ViewId): void;
  /** One-line status shown in the navigation rail for each data set. */
  setStatus(view: ViewId, text: string): void;
}

/**
 * Builds the page frame: a navigation rail (views, sections, status, theme) and one content area per view.
 * Citation and patrol reports live in separate views so patrol data is never mixed into citation pages (FR-28).
 */
export function mountShell(app: HTMLElement, cityName: string, theme: ReturnType<typeof createTheme>, onShow: (view: ViewId) => void): Shell {
  const sections: Record<string, HTMLElement> = {};
  const views = new Map<ViewId, { page: HTMLElement; link: HTMLAnchorElement; sub: HTMLElement; status: HTMLElement }>();

  const rail = el('aside', undefined, 'rail');
  rail.id = 'rail';
  const brand = el('div', undefined, 'brand');
  brand.append(el('strong', 'Citation Insights'), el('span', cityName, 'muted'));
  const nav = el('nav');
  nav.setAttribute('aria-label', 'Views and sections');
  const main = el('main');
  main.id = 'main';

  // The menu is open by default on wide screens and closed on narrow ones, where it opens over the page as a drawer.
  const narrow = globalThis.matchMedia?.('(max-width: 56rem)');
  let open = !(narrow?.matches ?? false);
  const toggle = el('button', undefined, 'secondary menu-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'rail');
  const topbar = el('div', undefined, 'topbar');
  topbar.append(toggle, el('strong', 'Citation Insights', 'topbar-brand'));
  const scrim = el('div', undefined, 'scrim');
  function setOpen(next: boolean): void {
    open = next;
    rail.hidden = !open;
    scrim.hidden = !(open && (narrow?.matches ?? false));
    app!.classList.toggle('rail-collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide menu' : 'Menu';
  }
  toggle.addEventListener('click', () => setOpen(!open));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && narrow?.matches) {
      setOpen(false);
      toggle.focus();
    }
  });
  narrow?.addEventListener('change', () => setOpen(!narrow.matches));
  const closeIfNarrow = () => narrow?.matches && setOpen(false);

  for (const v of VIEWS) {
    const link = el('a', v.title, 'view-link');
    link.href = `#${v.id}`;
    const sub = el('ul', undefined, 'subnav');
    for (const s of v.sections) {
      const li = el('li');
      const a = el('a', s.nav);
      a.href = `#${s.id}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        show(v.id);
        sections[s.id].scrollIntoView({ block: 'start' });
        sections[s.id].focus({ preventScroll: true });
        closeIfNarrow();
      });
      li.append(a);
      sub.append(li);
    }
    const status = el('p', 'Nothing loaded', 'muted status-line');
    nav.append(link, status, sub);

    const page = el('div', undefined, 'view');
    page.id = `view-${v.id}`;
    const head = el('header', undefined, 'view-head');
    head.append(el('h1', v.title), el('p', v.blurb, 'muted'));
    page.append(head);
    for (const s of v.sections) {
      const section = el('section', undefined, 'report');
      section.id = s.id;
      section.tabIndex = -1;
      sections[s.id] = section;
      page.append(section);
    }
    main.append(page);
    views.set(v.id, { page, link, sub, status });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      show(v.id);
      window.scrollTo({ top: 0 });
      closeIfNarrow();
    });
  }

  const foot = el('div', undefined, 'rail-foot');
  foot.append(themeToggle(theme));
  rail.append(brand, nav, foot);

  const skip = el('a', 'Skip to content', 'skip-link');
  skip.href = '#main';
  app.classList.add('shell');
  main.prepend(topbar);
  app.append(skip, rail, scrim, main);
  setOpen(open);

  function show(view: ViewId): void {
    for (const [id, v] of views) {
      const active = id === view;
      v.page.hidden = !active;
      v.sub.hidden = !active;
      if (active) v.link.setAttribute('aria-current', 'page');
      else v.link.removeAttribute('aria-current');
    }
    onShow(view);
  }

  return {
    sections,
    show,
    setStatus(view, text) {
      views.get(view)!.status.textContent = text;
    },
  };
}
