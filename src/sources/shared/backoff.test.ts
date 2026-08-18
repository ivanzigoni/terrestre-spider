import { describe, expect, it, vi } from 'vitest';

import { backoffOnRateLimit } from './backoff.js';

function makeContext(response: unknown, retryCount = 0) {
  return {
    request: { retryCount },
    response,
    log: { warning: vi.fn() },
  };
}

describe('backoffOnRateLimit', () => {
  it('espera em 429, lido via statusCode (CheerioCrawler/HttpCrawler)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const context = makeContext({ statusCode: 429 });

    await backoffOnRateLimit(context, sleepFn);

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(2000);
    expect(context.log.warning).toHaveBeenCalledTimes(1);
  });

  it('espera em 503, lido via status() (PlaywrightCrawler)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const context = makeContext({ status: () => 503 });

    await backoffOnRateLimit(context, sleepFn);

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(2000);
  });

  it('dobra o backoff a cada tentativa, até o teto', async () => {
    const sleepFn = vi
      .fn<(ms: number) => Promise<void>>()
      .mockResolvedValue(undefined);

    await backoffOnRateLimit(makeContext({ statusCode: 429 }, 0), sleepFn);
    await backoffOnRateLimit(makeContext({ statusCode: 429 }, 1), sleepFn);
    await backoffOnRateLimit(makeContext({ statusCode: 429 }, 2), sleepFn);
    await backoffOnRateLimit(makeContext({ statusCode: 429 }, 10), sleepFn);

    expect(sleepFn.mock.calls.map((call) => call[0])).toEqual([
      2000, 4000, 8000, 60000,
    ]);
  });

  it('não espera para status fora de 429/503', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await backoffOnRateLimit(makeContext({ statusCode: 500 }), sleepFn);
    await backoffOnRateLimit(makeContext({ statusCode: 404 }), sleepFn);
    await backoffOnRateLimit(makeContext({ statusCode: 200 }), sleepFn);

    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('não espera quando não há response (erro de rede, parsing, timeout)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await backoffOnRateLimit(makeContext(undefined), sleepFn);
    await backoffOnRateLimit(makeContext(null), sleepFn);
    await backoffOnRateLimit(makeContext({}), sleepFn);

    expect(sleepFn).not.toHaveBeenCalled();
  });
});
