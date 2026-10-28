/** Small DOM helpers shared by panels. All text is set as text, never HTML. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** Section heading with a plain-language title and the PRD report code as a quiet reference. */
export function heading(title: string, code?: string, level: 'h2' | 'h3' = 'h2'): HTMLHeadingElement {
  const h = el(level, title);
  if (code) h.append(' ', el('small', code, 'ref'));
  return h;
}

/** Required notices and labels (FR-22, FR-24, RPT-3, RPT-5) share one callout; the wording is passed through unchanged. */
export function notice(text: string, kind: 'info' | 'estimate' | 'error' = 'info'): HTMLParagraphElement {
  return el('p', text, kind === 'info' ? 'notice' : `notice notice-${kind}`);
}

/** A label wrapping a control, with the text first. */
export function field(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', undefined, 'field');
  l.append(el('span', text), control);
  return l;
}

export function emptyState(text: string): HTMLParagraphElement {
  return el('p', text, 'empty');
}

/** Collapses a long list behind a count; the content stays in the DOM for assistive tech. */
export function disclosure(summary: string, content: HTMLElement, open = false): HTMLDetailsElement {
  const d = el('details');
  d.open = open;
  d.append(el('summary', summary), content);
  return d;
}
