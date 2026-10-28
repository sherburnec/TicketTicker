/** Patrol CSV text held in memory for the session, with a description of where it came from (FR-28). */
export interface LoadedPatrol {
  csv: string;
  label: string;
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
  onChange: () => void,
  sample?: () => LoadedPatrol,
): void {
  root.innerHTML = `
    <fieldset>
      <legend>Patrol data source (internal only)</legend>
      <label><input type="radio" name="patrol-source" value="none" checked /> None</label>
      <label><input type="radio" name="patrol-source" value="sample" ${sample ? '' : 'disabled'} /> Generated sample</label>
      <label><input type="radio" name="patrol-source" value="upload" /> Samsara CSV upload</label>
      <div data-for="upload" hidden>
        <input type="file" name="patrol-file" accept=".csv,text/csv" />
      </div>
      <button type="button" name="load-patrol">Apply</button>
      <p role="status" data-status></p>
    </fieldset>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const mode = () => root.querySelector<HTMLInputElement>('input[name="patrol-source"]:checked')!.value;
  const status = $('[data-status]');

  root.addEventListener('change', () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== mode();
  });

  $('button[name="load-patrol"]').addEventListener('click', async () => {
    status.textContent = '';
    try {
      if (mode() === 'none') {
        store.clear();
        status.textContent = 'No patrol data loaded.';
      } else if (mode() === 'sample' && sample) {
        const data = sample();
        store.set(data);
        status.textContent = data.label;
      } else {
        const file = $<HTMLInputElement>('input[name="patrol-file"]').files?.[0];
        if (!file) throw new Error('Choose a CSV file first.');
        const data = await uploadedPatrol(file);
        store.set(data);
        status.textContent = data.label;
      }
      onChange();
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
