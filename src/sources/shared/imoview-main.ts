import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { HttpCrawler } from 'crawlee';

import { AppDataSource } from '../../persistence/data-source.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { backoffOnRateLimit } from './backoff.js';
import { type CrawlStats, sumCrawlStats } from './crawl-stats.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from './crawler-defaults.js';
import { buildSearchPayload, resolveCidadeCode } from './imoview-client.js';
import { createImoviewRouter } from './imoview-router.js';
import { reportFailedRequest } from './report-failed-request.js';
import { runWithWatchdog } from './run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from './storage.js';

/**
 * Fábrica de `run()` compartilhada por toda imobiliária do cluster Imoview — só
 * `baseUrl`/`origem`/`nomeExibicao` mudam entre elas (ver
 * `discovery/imoview-diagnostico.md`). `cidadeSlugAmigavel` é o slug usado pelo próprio
 * Imoview (`nomeurlamigavel`, ex.: `"belo-horizonte"`), resolvido em código de cidade
 * específico deste cliente antes de buscar imóveis — `codigocidade` não é global.
 */
export function createImoviewRun(
  baseUrl: string,
  origem: OrigemAnuncio,
  nomeExibicao: string,
  cidadeSlugAmigavel = 'belo-horizonte',
): () => Promise<CrawlStats> {
  return async function run(): Promise<CrawlStats> {
    const cidade = await resolveCidadeCode(baseUrl, cidadeSlugAmigavel);
    const dataset = await openFreshDataset(origem);
    const endpointUrl = `${baseUrl}/retornar-imoveis-disponiveis`;

    // Um crawler por tipo de transação (aluguel, venda) — mesmo padrão das demais
    // fontes: o teto de páginas (maxRequestsPerCrawl) vale por transação, não somado.
    const stats: CrawlStats[] = [];
    for (const tipoTransacao of Object.values(TipoTransacao)) {
      const requestQueue = await openFreshRequestQueue(
        `${origem}-${tipoTransacao}`,
      );
      const crawler = new HttpCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createImoviewRouter(dataset, baseUrl, origem),
        requestQueue,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
        errorHandler: (context) => backoffOnRateLimit(context),
        failedRequestHandler: (context, error) => {
          reportFailedRequest(origem, context, error);
        },
      });

      stats.push(
        await runWithWatchdog(
          `${nomeExibicao} ${tipoTransacao}`,
          crawler.run([
            {
              url: endpointUrl,
              method: 'POST',
              payload: buildSearchPayload({
                cidade,
                tipoTransacao,
                numeroPagina: 1,
              }),
              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8',
              },
              userData: { tipoTransacao, cidade, numeroPagina: 1 },
            },
          ]),
        ),
      );
    }

    await AppDataSource.initialize();
    try {
      await loadIntoPostgres(dataset, AppDataSource);
    } finally {
      await AppDataSource.destroy();
    }

    return sumCrawlStats(stats);
  };
}
