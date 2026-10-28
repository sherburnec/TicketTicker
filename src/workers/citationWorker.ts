import { importCitations, type ImportMessage, type ImportRequest } from '../import/citations.ts';

const post = (msg: ImportMessage) => self.postMessage(msg);

self.onmessage = (e: MessageEvent<ImportRequest>) => {
  try {
    const result = importCitations(e.data.csv, e.data.city, (done, total) => post({ type: 'progress', done, total }));
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
