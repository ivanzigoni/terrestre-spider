export interface CrawlStats {
  requestsFinished: number;
  requestsFailed: number;
  requestsTotal: number;
  crawlerRuntimeMillis: number;
  requestTotalDurationMillis: number;
  requestAvgFinishedDurationMillis: number;
  requestAvgFailedDurationMillis: number;
  retryHistogram: number[];
}

// Contadores locais de cada fonte, não vêm do FinalStatistics do Crawlee — cada
// `*-main.ts` já os calcula em memória hoje, só nunca saem da função.
export interface ExecucaoStats extends CrawlStats {
  anunciosEncontrados: number;
  anunciosUnicosDetalhe: number;
  capturasBrutasEnviadas: number;
}

interface MediaPonderada {
  media: number;
  peso: number;
}

// Duas médias não somam para uma média válida (500ms + 600ms não vira 1100ms) — o
// ponderador correto é o número de requests que cada sub-crawl realmente mediu.
function mediaPonderada(entradas: MediaPonderada[]): number {
  const pesoTotal = entradas.reduce((acc, e) => acc + e.peso, 0);
  if (pesoTotal === 0) return 0;
  return entradas.reduce((acc, e) => acc + e.media * e.peso, 0) / pesoTotal;
}

// retryHistogram é indexado por número de retentativas (índice 0 = sem retry) — soma
// elemento a elemento, com padding pra sub-crawls com profundidades de retry diferentes.
function somaRetryHistograms(histogramas: number[][]): number[] {
  const tamanhoMax = Math.max(0, ...histogramas.map((h) => h.length));
  const resultado = new Array<number>(tamanhoMax).fill(0);
  for (const histograma of histogramas) {
    histograma.forEach((valor, indice) => {
      resultado[indice] = (resultado[indice] ?? 0) + valor;
    });
  }
  return resultado;
}

/**
 * Cada fonte roda um crawler por URL de busca (aluguel, venda) mais a fase de detalhe —
 * as estatísticas do Crawlee (`crawler.run()`) vêm uma por sub-crawl e precisam ser
 * agregadas num total por fonte/rodada, usado no registro de execução. Contagens somam
 * direto; `requestAvgFinishedDurationMillis`/`requestAvgFailedDurationMillis` são médias
 * (agregadas por média ponderada, não soma); `retryHistogram` é array (soma elemento a
 * elemento). `requestsFinishedPerMinute`/`requestsFailedPerMinute` do FinalStatistics do
 * Crawlee ficam de fora de propósito: são taxas por sub-crawl, agregá-las aqui seria tão
 * enganoso quanto somar as médias, e o dado pra recomputar (requests concluídos e duração
 * real da execução) já fica disponível na própria tabela de execuções.
 */
export function sumCrawlStats(stats: CrawlStats[]): CrawlStats {
  return {
    requestsFinished: stats.reduce((acc, s) => acc + s.requestsFinished, 0),
    requestsFailed: stats.reduce((acc, s) => acc + s.requestsFailed, 0),
    requestsTotal: stats.reduce((acc, s) => acc + s.requestsTotal, 0),
    crawlerRuntimeMillis: stats.reduce(
      (acc, s) => acc + s.crawlerRuntimeMillis,
      0,
    ),
    requestTotalDurationMillis: stats.reduce(
      (acc, s) => acc + s.requestTotalDurationMillis,
      0,
    ),
    requestAvgFinishedDurationMillis: mediaPonderada(
      stats.map((s) => ({
        media: s.requestAvgFinishedDurationMillis,
        peso: s.requestsFinished,
      })),
    ),
    requestAvgFailedDurationMillis: mediaPonderada(
      stats.map((s) => ({
        media: s.requestAvgFailedDurationMillis,
        peso: s.requestsFailed,
      })),
    ),
    retryHistogram: somaRetryHistograms(stats.map((s) => s.retryHistogram)),
  };
}
