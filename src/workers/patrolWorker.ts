import { importPatrol, type PatrolMessage, type PatrolRequest } from '../patrol/importer.ts';

const post = (msg: PatrolMessage) => self.postMessage(msg);

self.onmessage = (e: MessageEvent<PatrolRequest>) => {
  try {
    post({ type: 'done', result: importPatrol(e.data, (done, total) => post({ type: 'progress', done, total })) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
