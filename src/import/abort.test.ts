import { afterEach, describe, expect, it, vi } from 'vitest';
import { importCitationsInWorker } from './citations.ts';
import { importPatrolInWorker, type PatrolRequest } from '../patrol/importer.ts';

const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
vi.stubGlobal('Worker', class {
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    workers.push(this);
  }
});
afterEach(() => (workers.length = 0));

describe('import workers', () => {
  it('terminate and reject when the dashboard aborts them', async () => {
    const a = new AbortController();
    const p = importCitationsInWorker('x', {} as never, undefined, a.signal);
    const q = importPatrolInWorker({} as PatrolRequest, undefined, a.signal);
    a.abort();
    await expect(p).rejects.toThrow(/cancelled/i);
    await expect(q).rejects.toThrow(/cancelled/i);
    expect(workers).toHaveLength(2);
    expect(workers.every((w) => w.terminate.mock.calls.length === 1)).toBe(true);
  });
});
