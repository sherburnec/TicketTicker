import { loadCitySource, mountSourcePanel, type LoadedCitations } from './ui/sourcePanel.ts';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'Citation Insights';
  const panel = document.createElement('div');
  const loaded = document.createElement('p');
  loaded.textContent = 'No citation data loaded.';
  app.append(title, panel, loaded);

  // In-memory only for the session (NFR-1); the importer (task 3.2) consumes this.
  let citations: LoadedCitations | undefined;
  mountSourcePanel(panel, loadCitySource('burbank'), (data) => {
    citations = data;
    const rows = Math.max(0, citations.csv.trimEnd().split(/\r?\n/).length - 1);
    loaded.textContent = `${citations.label}: ${rows.toLocaleString()} lines loaded.`;
  });
}
