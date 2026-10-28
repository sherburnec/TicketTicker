import type { PatrolFormat } from '../patrol/formats.ts';
import { zoneClock } from '../patrol/time.ts';
import { DEFAULT_SAMPLE_CONFIG } from '../sample/config.ts';
import { generatePatrolSample, type PatrolSource } from '../sample/patrol.ts';

/** Patrol CSV text held in memory for the session, with a description of where it came from (FR-28). */
export interface LoadedPatrol {
  csv: string;
  label: string;
  /** Zone for times with no UTC marker or offset; the city zone unless the user changes it (FR-33). */
  timeZone?: string;
}

/** Held apart from the citation data: loading, replacing or clearing it never touches citations (FR-28). */
export function createPatrolStore() {
  let current: LoadedPatrol | undefined;
  return {
    get(): LoadedPatrol | undefined {
      return current;
    },
    set(data: LoadedPatrol): void {
      current = data;
    },
    /** The "none" source. */
    clear(): void {
      current = undefined;
    },
  };
}

export interface PatrolSampleOptions {
  format: PatrolFormat;
  months: number;
  seed?: string;
  /** Adds invalid rows so the reject and exclude paths can be tried (FR-46). */
  injectErrors: boolean;
}

const INJECT_PER_KIND = 3;

/** Generated patrol CSV for the same importer as an upload (FR-41). A seed is chosen and shown when none is given. */
export function samplePatrol(source: PatrolSource, o: PatrolSampleOptions): LoadedPatrol {
  if (!Number.isInteger(o.months) || o.months < 1) throw new Error('Duration must be a whole number of months, at least 1.');
  const seed = o.seed || String(Math.floor(Math.random() * 2 ** 32));
  const errors = o.injectErrors
    ? { badTime: INJECT_PER_KIND, latLonRange: INJECT_PER_KIND, swapped: INJECT_PER_KIND, zeroZero: INJECT_PER_KIND, missingVehicle: INJECT_PER_KIND, duplicate: INJECT_PER_KIND, outsideExtent: INJECT_PER_KIND }
    : undefined;
  const { csv } = generatePatrolSample({ durationMonths: o.months, seed }, source, o.format, errors);
  return { csv, label: `Sample patrol data, Format ${o.format}, ${o.months} month${o.months === 1 ? '' : 's'}, seed ${seed}${errors ? ', with injected errors' : ''}` };
}

/** Reads the file in the browser; nothing is sent anywhere (NFR-1). */
export async function uploadedPatrol(file: File): Promise<LoadedPatrol> {
  const csv = await file.text();
  if (csv.trim() === '') throw new Error(`${file.name} is empty.`);
  return { csv, label: `Upload: ${file.name}` };
}

/**
 * Patrol source selector: none, generated sample or Samsara CSV upload, independent of the citation source (FR-28).
 * `sample` is the generator; without one the sample option is disabled.
 */
export function mountPatrolSourcePanel(
  root: HTMLElement,
  store: ReturnType<typeof createPatrolStore>,
  defaultZone: string,
  onChange: () => void,
  sample?: (o: PatrolSampleOptions) => LoadedPatrol,
): void {
  root.innerHTML = `
    <fieldset>
      <legend>Patrol data source (internal only)</legend>
      <label><input type="radio" name="patrol-source" value="none" checked /> None</label>
      <label><input type="radio" name="patrol-source" value="sample" ${sample ? '' : 'disabled'} /> Generated sample</label>
      <label><input type="radio" name="patrol-source" value="upload" /> Samsara CSV upload</label>
      <div data-for="sample" hidden>
        <label>Months <input type="number" name="patrol-months" min="1" step="1" value="${DEFAULT_SAMPLE_CONFIG.durationMonths}" /></label>
        <label>Seed (optional) <input type="text" name="patrol-seed" /></label>
        <label>Format <select name="patrol-format"><option value="A">A: GPS location history</option><option value="B">B: Trip History report</option></select></label>
        <label><input type="checkbox" name="patrol-inject" /> Add invalid rows (error injection)</label>
        <button type="button" name="download-patrol">Download loaded sample CSV</button>
      </div>
      <div data-for="upload" hidden>
        <input type="file" name="patrol-file" accept=".csv,text/csv" />
      </div>
      <label>Time zone for times without an offset <input type="text" name="patrol-zone" value="${defaultZone}" /></label>
      <button type="button" name="load-patrol">Apply</button>
      <p role="status" data-status></p>
    </fieldset>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const mode = () => root.querySelector<HTMLInputElement>('input[name="patrol-source"]:checked')!.value;
  const status = $('[data-status]');

  root.addEventListener('change', () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== mode();
  });

  $('button[name="download-patrol"]').addEventListener('click', () => {
    const data = store.get();
    if (!data) return (status.textContent = 'Apply a sample first.');
    const url = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patrol-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('button[name="load-patrol"]').addEventListener('click', async () => {
    status.textContent = '';
    try {
      const timeZone = $<HTMLInputElement>('input[name="patrol-zone"]').value.trim() || defaultZone;
      try {
        zoneClock(timeZone);
      } catch {
        throw new Error(`Unknown time zone: ${timeZone}`);
      }
      if (mode() === 'none') {
        store.clear();
        status.textContent = 'No patrol data loaded.';
      } else if (mode() === 'sample' && sample) {
        const data = {
          ...sample({
            format: $<HTMLSelectElement>('select[name="patrol-format"]').value as PatrolFormat,
            months: Number($<HTMLInputElement>('input[name="patrol-months"]').value),
            seed: $<HTMLInputElement>('input[name="patrol-seed"]').value.trim(),
            injectErrors: $<HTMLInputElement>('input[name="patrol-inject"]').checked,
          }),
          timeZone,
        };
        store.set(data);
        status.textContent = data.label;
      } else {
        const file = $<HTMLInputElement>('input[name="patrol-file"]').files?.[0];
        if (!file) throw new Error('Choose a CSV file first.');
        const data = { ...(await uploadedPatrol(file)), timeZone };
        store.set(data);
        status.textContent = data.label;
      }
      onChange();
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
