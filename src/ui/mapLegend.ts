import { el } from './dom.ts';

/** Legend under the citation map. Colors match the layer paint in `map/style.ts`. */
export function citationMapLegend(): HTMLElement {
  const root = el('div', undefined, 'legend');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Map legend');

  const ramp = el('div', undefined, 'legend-item');
  const bar = el('span', undefined, 'legend-ramp');
  bar.style.background = 'linear-gradient(90deg, #f6c35b, #e8743b, #b3261e)';
  bar.setAttribute('aria-hidden', 'true');
  ramp.append(el('span', 'Fewer citations'), bar, el('span', 'More citations'));

  const pin = el('div', undefined, 'legend-item');
  const dot = el('span', undefined, 'legend-dot');
  dot.setAttribute('aria-hidden', 'true');
  pin.append(dot, el('span', 'Named location'));

  const coverage = el('div', undefined, 'legend-item');
  const line = el('span', undefined, 'legend-line');
  line.setAttribute('aria-hidden', 'true');
  coverage.append(line, el('span', 'Blocks where the selected officer wrote citations'));

  root.append(ramp, pin, coverage);
  return root;
}
