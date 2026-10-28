import { loadCitySource, mountSourcePanel } from './ui/sourcePanel.ts';
import { importCitationsInWorker, type ImportResult } from './import/citations.ts';
import { renderImportSummary } from './ui/importSummary.ts';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Citation Insights';
  const panel = document.createElement('div');
  const loaded = document.createElement('p');
  loaded.textContent = 'No citation data loaded.';
  const summary = document.createElement('div');
  app.append(title, panel, loaded, summary);

  // In-memory only for the session (NFR-1).
  let citations: ImportResult | undefined;
  const source = loadCitySource('burbank');
  mountSourcePanel(panel, source, async (data) => {
    try {
      citations = await importCitationsInWorker(data.csv, source, (done, total) => {
        loaded.textContent = `Importing ${done.toLocaleString()} of ${total.toLocaleString()} rows…`;
      });
      loaded.textContent = data.label;
      renderImportSummary(summary, citations);
    } catch (e) {
      loaded.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
