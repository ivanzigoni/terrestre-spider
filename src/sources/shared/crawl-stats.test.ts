import { describe, expect, it } from 'vitest';

import { sumCrawlStats } from './crawl-stats.js';

describe('sumCrawlStats', () => {
  it('soma campos aditivos entre múltiplos sub-crawls da mesma fonte', () => {
    const result = sumCrawlStats([
      {
        requestsFinished: 10,
        requestsFailed: 1,
        requestsTotal: 11,
        crawlerRuntimeMillis: 1000,
        requestTotalDurationMillis: 5000,
        requestAvgFinishedDurationMillis: 450,
        requestAvgFailedDurationMillis: 900,
        retryHistogram: [8, 2],
      },
      {
        requestsFinished: 5,
        requestsFailed: 2,
        requestsTotal: 7,
        crawlerRuntimeMillis: 500,
        requestTotalDurationMillis: 2500,
        requestAvgFinishedDurationMillis: 300,
        requestAvgFailedDurationMillis: 600,
        retryHistogram: [4, 1, 1],
      },
    ]);

    expect(result.requestsFinished).toBe(15);
    expect(result.requestsFailed).toBe(3);
    expect(result.requestsTotal).toBe(18);
    expect(result.crawlerRuntimeMillis).toBe(1500);
    expect(result.requestTotalDurationMillis).toBe(7500);
  });

  it('agrega as durações médias por média ponderada, não soma', () => {
    const result = sumCrawlStats([
      {
        requestsFinished: 10,
        requestsFailed: 2,
        requestsTotal: 12,
        crawlerRuntimeMillis: 0,
        requestTotalDurationMillis: 0,
        requestAvgFinishedDurationMillis: 400,
        requestAvgFailedDurationMillis: 1000,
        retryHistogram: [],
      },
      {
        requestsFinished: 30,
        requestsFailed: 0,
        requestsTotal: 30,
        crawlerRuntimeMillis: 0,
        requestTotalDurationMillis: 0,
        requestAvgFinishedDurationMillis: 200,
        requestAvgFailedDurationMillis: 0,
        retryHistogram: [],
      },
    ]);

    // (400*10 + 200*30) / 40 = 250, não (400+200)/2 = 300
    expect(result.requestAvgFinishedDurationMillis).toBe(250);
    // só o primeiro sub-crawl teve requests falhos — a média ponderada ignora o
    // segundo (peso 0) em vez de diluir a média com um valor de sub-crawl sem falhas
    expect(result.requestAvgFailedDurationMillis).toBe(1000);
  });

  it('não divide por zero quando nenhum sub-crawl teve requests falhos', () => {
    const result = sumCrawlStats([
      {
        requestsFinished: 10,
        requestsFailed: 0,
        requestsTotal: 10,
        crawlerRuntimeMillis: 0,
        requestTotalDurationMillis: 0,
        requestAvgFinishedDurationMillis: 400,
        requestAvgFailedDurationMillis: 0,
        retryHistogram: [],
      },
    ]);

    expect(result.requestAvgFailedDurationMillis).toBe(0);
  });

  it('soma retryHistogram elemento a elemento, com padding para tamanhos diferentes', () => {
    const result = sumCrawlStats([
      {
        requestsFinished: 1,
        requestsFailed: 0,
        requestsTotal: 1,
        crawlerRuntimeMillis: 0,
        requestTotalDurationMillis: 0,
        requestAvgFinishedDurationMillis: 0,
        requestAvgFailedDurationMillis: 0,
        retryHistogram: [8, 2],
      },
      {
        requestsFinished: 1,
        requestsFailed: 0,
        requestsTotal: 1,
        crawlerRuntimeMillis: 0,
        requestTotalDurationMillis: 0,
        requestAvgFinishedDurationMillis: 0,
        requestAvgFailedDurationMillis: 0,
        retryHistogram: [4, 1, 1],
      },
    ]);

    expect(result.retryHistogram).toEqual([12, 3, 1]);
  });

  it('retorna zero para lista vazia', () => {
    const result = sumCrawlStats([]);

    expect(result).toEqual({
      requestsFinished: 0,
      requestsFailed: 0,
      requestsTotal: 0,
      crawlerRuntimeMillis: 0,
      requestTotalDurationMillis: 0,
      requestAvgFinishedDurationMillis: 0,
      requestAvgFailedDurationMillis: 0,
      retryHistogram: [],
    });
  });

  it('funciona com um único sub-crawl', () => {
    const result = sumCrawlStats([
      {
        requestsFinished: 7,
        requestsFailed: 0,
        requestsTotal: 7,
        crawlerRuntimeMillis: 300,
        requestTotalDurationMillis: 1400,
        requestAvgFinishedDurationMillis: 200,
        requestAvgFailedDurationMillis: 0,
        retryHistogram: [7],
      },
    ]);

    expect(result).toEqual({
      requestsFinished: 7,
      requestsFailed: 0,
      requestsTotal: 7,
      crawlerRuntimeMillis: 300,
      requestTotalDurationMillis: 1400,
      requestAvgFinishedDurationMillis: 200,
      requestAvgFailedDurationMillis: 0,
      retryHistogram: [7],
    });
  });
});
