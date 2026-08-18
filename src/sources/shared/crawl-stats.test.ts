import { describe, expect, it } from 'vitest';

import { sumCrawlStats } from './crawl-stats.js';

describe('sumCrawlStats', () => {
  it('soma requestsFinished/requestsFailed entre múltiplas URLs da mesma fonte', () => {
    const result = sumCrawlStats([
      { requestsFinished: 10, requestsFailed: 1 },
      { requestsFinished: 5, requestsFailed: 2 },
    ]);

    expect(result).toEqual({ requestsFinished: 15, requestsFailed: 3 });
  });

  it('retorna zero para lista vazia', () => {
    expect(sumCrawlStats([])).toEqual({
      requestsFinished: 0,
      requestsFailed: 0,
    });
  });

  it('funciona com uma única URL', () => {
    expect(sumCrawlStats([{ requestsFinished: 7, requestsFailed: 0 }])).toEqual(
      { requestsFinished: 7, requestsFailed: 0 },
    );
  });
});
