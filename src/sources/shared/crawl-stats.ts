export interface CrawlStats {
  requestsFinished: number;
  requestsFailed: number;
}

/**
 * Cada fonte roda um crawler por URL de busca (aluguel, venda) — as estatísticas do
 * Crawlee (`crawler.run()`) vêm uma por URL e precisam ser somadas para virar um total
 * por fonte/rodada, usado no registro de execução.
 */
export function sumCrawlStats(stats: CrawlStats[]): CrawlStats {
  return stats.reduce(
    (acc, s) => ({
      requestsFinished: acc.requestsFinished + s.requestsFinished,
      requestsFailed: acc.requestsFailed + s.requestsFailed,
    }),
    { requestsFinished: 0, requestsFailed: 0 },
  );
}
