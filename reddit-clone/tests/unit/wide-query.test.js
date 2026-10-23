import { afterEach, describe, expect, it, vi } from 'vitest';

// A pool whose queries wait until the test releases them
const state = { running: 0, peak: 0, settings: [], gates: [] };
vi.mock('@/db', () => ({
  default: async () => ({
    connect: async () => ({
      query: async (text) => {
        if (/^(SET|RESET) /.test(text)) {
          state.settings.push(text);
          return {};
        }
        state.running++;
        state.peak = Math.max(state.peak, state.running);
        await new Promise((resolve) => state.gates.push(resolve));
        state.running--;
        return { rows: [text] };
      },
      release() {},
    }),
  }),
}));

const { timedQuery, BusyError } = await import('@/lib/submissions');

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
async function releaseAll() {
  while (state.gates.length) {
    state.gates.shift()();
    await settle();
  }
}

afterEach(() => {
  vi.useRealTimers();
  Object.assign(state, { running: 0, peak: 0, settings: [], gates: [] });
});

describe('timedQuery wide-query limit', () => {
  it('runs at most two wide queries at once and the rest in turn', async () => {
    const queries = [1, 2, 3, 4].map((n) => timedQuery(`SELECT ${n}`, [], 1000, { wide: true }));
    await settle();
    expect(state.running).toBe(2);
    await releaseAll();
    const results = await Promise.all(queries);
    expect(results.map((r) => r.rows[0])).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3', 'SELECT 4']);
    expect(state.peak).toBe(2);
  });

  it('turns parallel workers off for wide queries only', async () => {
    const narrow = timedQuery('SELECT 1', []);
    const wide = timedQuery('SELECT 2', [], 1000, { wide: true });
    await settle();
    await releaseAll();
    await Promise.all([narrow, wide]);
    expect(state.settings.filter((s) => s.includes('max_parallel_workers_per_gather'))).toEqual([
      'SET max_parallel_workers_per_gather = 0',
      'RESET max_parallel_workers_per_gather',
    ]);
  });

  it('does not limit narrow queries', async () => {
    const queries = [1, 2, 3, 4].map((n) => timedQuery(`SELECT ${n}`, []));
    await settle();
    expect(state.running).toBe(4);
    await releaseAll();
    await Promise.all(queries);
  });

  it('gives up with a BusyError after waiting 15 seconds', async () => {
    vi.useFakeTimers();
    const running = [1, 2].map((n) => timedQuery(`SELECT ${n}`, [], 1000, { wide: true }));
    const waiting = timedQuery('SELECT 3', [], 1000, { wide: true });
    const failed = expect(waiting).rejects.toBeInstanceOf(BusyError);
    await vi.advanceTimersByTimeAsync(15001);
    await failed;
    vi.useRealTimers();
    await releaseAll();
    await Promise.all(running);
    // The slots were freed: a new wide query runs straight away
    const next = timedQuery('SELECT 4', [], 1000, { wide: true });
    await settle();
    expect(state.running).toBe(1);
    await releaseAll();
    await next;
  });
});
