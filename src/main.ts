import { loadCitySource, mountSourcePanel } from './ui/sourcePanel.ts';
import { importCitationsInWorker, type ImportResult } from './import/citations.ts';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Citation Insights';
  const panel = document.createElement('div');
  const loaded = document.createElement('p');
  loaded.textContent = 'No citation data loaded.';
  app.append(title, panel, loaded);

  // In-memory only for the session (NFR-1).
  let citations: ImportResult | undefined;
  const source = loadCitySource('burbank');
  mountSourcePanel(panel, source, async (data) => {
    try {
      citations = await importCitationsInWorker(data.csv, source, (done, total) => {
        loaded.textContent = `Importing ${done.toLocaleString()} of ${total.toLocaleString()} rows…`;
      });
      const { imported, rejected, unmatched } = citations.counts;
      loaded.textContent = `${data.label}: ${imported.toLocaleString()} imported, ${rejected.toLocaleString()} rejected, ${unmatched.toLocaleString()} unmatched.`;
    } catch (e) {
      loaded.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
