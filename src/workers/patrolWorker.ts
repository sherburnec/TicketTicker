import { readPatrol, type PatrolImportOptions, type PatrolMessage, type PatrolPoint, type PatrolRequest } from '../patrol/importer.ts';

/** Placeholder until task 7.4 adds zone-aware conversion: ISO text with Z or an offset, or epoch seconds or milliseconds. */
const parseTime: PatrolImportOptions['parseTime'] = (raw) => {
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw);
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : t;
};

const post = (msg: PatrolMessage) => self.postMessage(msg);

self.onmessage = (e: MessageEvent<PatrolRequest>) => {
  try {
    const sink = (_p: PatrolPoint) => {};
    const result = readPatrol(e.data.csv, e.data.format, e.data.columns, { parseTime }, sink, (done, total) => post({ type: 'progress', done, total }));
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
