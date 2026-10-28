/** Light/dark theme choice. Held in memory for the session only: nothing is persisted (NFR-1). */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const LABEL: Record<ThemeChoice, string> = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };

export function nextChoice(c: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(c) + 1) % ORDER.length];
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

export function createTheme(root: HTMLElement = document.documentElement, query: MediaQueryList | undefined = globalThis.matchMedia?.('(prefers-color-scheme: dark)')) {
  let choice: ThemeChoice = 'system';
  const listeners = new Set<(t: ResolvedTheme) => void>();
  const resolved = () => resolveTheme(choice, query?.matches ?? false);

  function apply(): void {
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    const t = resolved();
    for (const l of listeners) l(t);
  }
  query?.addEventListener('change', () => choice === 'system' && apply());

  return {
    choice: () => choice,
    resolved,
    label: () => LABEL[choice],
    set(c: ThemeChoice): void {
      choice = c;
      apply();
    },
    cycle(): void {
      this.set(nextChoice(choice));
    },
    /** Called with the resolved theme now and on every change, so maps can restyle. */
    subscribe(fn: (t: ResolvedTheme) => void): void {
      listeners.add(fn);
      fn(resolved());
    },
  };
}

/** A button that cycles system, light and dark. */
export function themeToggle(theme: ReturnType<typeof createTheme>): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'secondary theme-toggle';
  const sync = () => (b.textContent = theme.label());
  b.addEventListener('click', () => {
    theme.cycle();
    sync();
  });
  sync();
  return b;
}
