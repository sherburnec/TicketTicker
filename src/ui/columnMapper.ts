import { FORMAT_FIELDS, detectAs, type ColumnMapping, type FieldKey, type PatrolFormat } from '../patrol/formats.ts';
import { el, field, heading, notice } from './dom.ts';

/**
 * Turns the user's column choices into a mapping (FR-35). Each required field needs a column, and one column
 * cannot serve two fields. `choices` maps a field to a header position, or undefined for "none".
 */
export function applyMapping(
  format: PatrolFormat,
  choices: Partial<Record<FieldKey, number | undefined>>,
): { mapping: ColumnMapping } | { error: string } {
  const mapping: ColumnMapping = {};
  const seen = new Map<number, string>();
  for (const spec of FORMAT_FIELDS[format]) {
    const col = choices[spec.key];
    if (col === undefined) {
      if (spec.required) return { error: `Choose a column for "${spec.label}".` };
      continue;
    }
    const other = seen.get(col);
    if (other) return { error: `One column cannot be both "${other}" and "${spec.label}".` };
    seen.set(col, spec.label);
    mapping[spec.key] = col;
  }
  return { mapping };
}

/**
 * Column mapper for files whose headers are not recognized. Pre-filled with the columns that were recognized;
 * calls `onConfirm` with the format and mapping once every required field is mapped.
 */
export function mountColumnMapper(
  root: HTMLElement,
  headers: string[],
  initial: PatrolFormat,
  onConfirm: (format: PatrolFormat, mapping: ColumnMapping) => void,
): void {
  let format = initial;

  function render(): void {
    root.replaceChildren(heading('Map the patrol file columns', undefined, 'h3'));
    root.append(notice('The column headers were not recognized. Choose which column holds each field.', 'estimate'));

    const formatSelect = el('select');
    formatSelect.setAttribute('aria-label', 'File format');
    for (const [value, text] of [['A', 'Format A: GPS location history'], ['B', 'Format B: Trip History report']] as const) {
      const o = el('option', text);
      o.value = value;
      o.selected = value === format;
      formatSelect.append(o);
    }
    formatSelect.addEventListener('change', () => {
      format = formatSelect.value as PatrolFormat;
      render();
    });
    root.append(formatSelect);

    const guess = detectAs(headers, format).mapping;
    const selects = new Map<FieldKey, HTMLSelectElement>();
    for (const spec of FORMAT_FIELDS[format]) {
      const select = el('select');
      select.setAttribute('aria-label', spec.label);
      const none = el('option', spec.required ? '(choose)' : '(none)');
      none.value = '';
      select.append(none);
      headers.forEach((h, i) => {
        const o = el('option', h || `(column ${i + 1})`);
        o.value = String(i);
        o.selected = guess[spec.key] === i;
        select.append(o);
      });
      selects.set(spec.key, select);
      root.append(field(`${spec.label}${spec.required ? ' (required)' : ''}`, select));
    }

    const status = el('p', undefined, 'form-error');
    status.setAttribute('role', 'status');
    const ok = el('button', 'Use this mapping');
    ok.type = 'button';
    ok.addEventListener('click', () => {
      const choices: Partial<Record<FieldKey, number | undefined>> = {};
      for (const [key, s] of selects) choices[key] = s.value === '' ? undefined : Number(s.value);
      const result = applyMapping(format, choices);
      if ('error' in result) status.textContent = result.error;
      else onConfirm(format, result.mapping);
    });
    root.append(ok, status);
  }

  render();
}
