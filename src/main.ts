import { loadCitySource, mountSourcePanel } from './ui/sourcePanel.ts';
import { importCitationsInWorker, type ImportResult } from './import/citations.ts';
import { renderImportSummary } from './ui/importSummary.ts';
import { mountRatesPanel } from './ui/ratesPanel.ts';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Citation Insights';
  const panel = document.createElement('div');
  const loaded = document.createElement('p');
  loaded.textContent = 'No citation data loaded.';
  const summary = document.createElement('div');
  const rates = document.createElement('div');
  app.append(title, panel, loaded, summary, rates);

  // In-memory only for the session (NFR-1).
  let citations: ImportResult | undefined;
  const source = loadCitySource('burbank');
  const ratesPanel = mountRatesPanel(rates, () => citations && { citations: citations.citations, ctx: { schedule: source.schedule, city: source.city } });
  mountSourcePanel(panel, source, async (data) => {
    try {
      citations = await importCitationsInWorker(data.csv, source, (done, total) => {
        loaded.textContent = `Importing ${done.toLocaleString()} of ${total.toLocaleString()} rows…`;
      });
      loaded.textContent = data.label;
      renderImportSummary(summary, citations);
      ratesPanel.refresh();
    } catch (e) {
      loaded.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
