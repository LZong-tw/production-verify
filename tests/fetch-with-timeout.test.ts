import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithTimeout,
  DEFAULT_FETCH_TIMEOUT_MS,
} from '../src/lib/fetch-with-timeout';

describe('fetchWithTimeout', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('passes through to global fetch with default 15s timeout signal', async () => {
    const seenInit: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      seenInit.push(init ?? {});
      return new Response('ok');
    }) as typeof fetch;

    await fetchWithTimeout('https://example.com');

    expect(seenInit).toHaveLength(1);
    expect(seenInit[0].signal).toBeInstanceOf(AbortSignal);
    expect(seenInit[0].signal?.aborted).toBe(false);
  });

  it('aborts when the configured timeout elapses', async () => {
    // Real fetch with a server that never responds is hard to simulate; instead
    // we plug a fake fetch that resolves only on signal abort.
    globalThis.fetch = vi.fn(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as typeof fetch;

    const start = Date.now();
    await expect(
      fetchWithTimeout('https://example.com/hangs', {}, 50),
    ).rejects.toThrow(/abort/i);
    const elapsed = Date.now() - start;
    // Should resolve very close to the 50ms cap, not hang for the default 15s.
    expect(elapsed).toBeLessThan(2000);
  });

  it('respects a caller-supplied signal and skips the timeout layer', async () => {
    let observedSignal: AbortSignal | null | undefined = undefined;
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Response('ok');
    }) as typeof fetch;

    const callerController = new AbortController();
    await fetchWithTimeout('https://example.com', {
      signal: callerController.signal,
    });

    // The caller's signal must reach fetch unchanged — not wrapped, not replaced.
    expect(observedSignal).toBe(callerController.signal);
  });

  it('exposes a 15-second default timeout constant for callers that need it', () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(15_000);
  });
});
