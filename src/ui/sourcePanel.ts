import { loadCity } from '../city/loadCity.ts';
import { parseBlocks } from '../city/blocks.ts';
import { parseFineSchedule, parseNamedLocations } from '../city/schedule.ts';
import { generateCitations, type CitationSource } from '../sample/citations.ts';
import { DEFAULT_SAMPLE_CONFIG } from '../sample/config.ts';

/** Citation CSV text held in memory for the session, with a description of where it came from (FR-1). */
export interface LoadedCitations {
  csv: string;
  label: string;
}

// Bundled at build time, so loading a city makes no network request.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const blocksFiles = raw(import.meta.glob('/data/*/blocks.csv', { eager: true, query: '?raw', import: 'default' }));
const segmentFiles = raw(import.meta.glob('/data/*/segments.geojson', { eager: true, query: '?raw', import: 'default' }));
const scheduleFiles = raw(import.meta.glob('/data/*/fine-schedule.csv', { eager: true, query: '?raw', import: 'default' }));
const locationFiles = raw(import.meta.glob('/data/*/named-locations.csv', { eager: true, query: '?raw', import: 'default' }));

function cityFile(files: Record<string, string>, id: string, name: string): string {
  const text = files[`/data/${id}/${name}`];
  if (text === undefined) throw new Error(`city ${id}: no ${name} found`);
  return text;
}

/** Everything the sample generator draws from, read from the city's data folder. */
export function loadCitySource(id: string): CitationSource {
  return {
    city: loadCity(id),
    schedule: parseFineSchedule(cityFile(scheduleFiles, id, 'fine-schedule.csv')),
    blocks: parseBlocks(cityFile(blocksFiles, id, 'blocks.csv'), cityFile(segmentFiles, id, 'segments.geojson')),
    namedLocations: parseNamedLocations(cityFile(locationFiles, id, 'named-locations.csv')),
  };
}

export function sampleCitations(source: CitationSource, durationMonths: number, seed?: string): LoadedCitations {
  if (!Number.isInteger(durationMonths) || durationMonths < 1) throw new Error('Duration must be a whole number of months, at least 1.');
  const csv = generateCitations({ durationMonths, seed: seed === undefined || seed === '' ? undefined : seed }, source);
  return { csv, label: `Sample data, ${durationMonths} month${durationMonths === 1 ? '' : 's'}${seed ? `, seed ${seed}` : ''}` };
}

/** Reads the file in the browser; nothing is sent anywhere (FR-5). */
export async function uploadedCitations(file: File): Promise<LoadedCitations> {
  const csv = await file.text();
  if (csv.trim() === '') throw new Error(`${file.name} is empty.`);
  return { csv, label: `Upload: ${file.name}` };
}

/** Source selector: generated sample or CSV upload. Calls `onLoad` with the CSV text for the importer. */
export function mountSourcePanel(root: HTMLElement, source: CitationSource, onLoad: (data: LoadedCitations) => void): void {
  root.innerHTML = `
    <fieldset>
      <legend>Citation data source</legend>
      <label><input type="radio" name="source" value="sample" checked /> Generated sample</label>
      <label><input type="radio" name="source" value="upload" /> CSV upload</label>
      <div data-for="sample">
        <label>Months <input type="number" name="months" min="1" step="1" value="${DEFAULT_SAMPLE_CONFIG.durationMonths}" /></label>
        <label>Seed (optional) <input type="text" name="seed" /></label>
      </div>
      <div data-for="upload" hidden>
        <input type="file" name="file" accept=".csv,text/csv" />
      </div>
      <button type="button" name="load">Load</button>
      <p role="status" data-status></p>
    </fieldset>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const mode = () => root.querySelector<HTMLInputElement>('input[name="source"]:checked')!.value;
  const status = $('[data-status]');

  root.addEventListener('change', () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = el.dataset.for !== mode();
  });

  $('button[name="load"]').addEventListener('click', async () => {
    status.textContent = '';
    try {
      let data: LoadedCitations;
      if (mode() === 'sample') {
        data = sampleCitations(source, Number($<HTMLInputElement>('input[name="months"]').value), $<HTMLInputElement>('input[name="seed"]').value.trim());
      } else {
        const file = $<HTMLInputElement>('input[name="file"]').files?.[0];
        if (!file) throw new Error('Choose a CSV file first.');
        data = await uploadedCitations(file);
      }
      onLoad(data);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
