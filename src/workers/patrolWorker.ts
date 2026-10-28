import { parseTimestamp, zoneClock } from '../patrol/time.ts';
import { readPatrol, type PatrolMessage, type PatrolPoint, type PatrolRequest } from '../patrol/importer.ts';

const post = (msg: PatrolMessage) => self.postMessage(msg);

self.onmessage = (e: MessageEvent<PatrolRequest>) => {
  try {
    const clock = zoneClock(e.data.timeZone);
    const sink = (_p: PatrolPoint) => {};
    const result = readPatrol(e.data.csv, e.data.format, e.data.columns, { parseTime: (raw) => parseTimestamp(raw, clock) }, sink, (done, total) => post({ type: 'progress', done, total }));
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
