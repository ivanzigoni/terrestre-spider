import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { HttpCrawler, log } from 'crawlee';

import { createDataSource } from '../../persistence/data-source.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  inserirCapturasBrutas,
  uploadCapturasBrutas,
} from '../../persistence/load-raw-captures.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { Mutex } from '../../persistence/upload-mutex.js';
import { backoffOnRateLimit } from './backoff.js';
import {
  type CrawlStats,
  type ExecucaoStats,
  sumCrawlStats,
} from './crawl-stats.js';
import {
  getMaxListingPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from './crawler-defaults.js';
import { buildSearchPayload, resolveCidadeCode } from './imoview-client.js';
import {
  createImoviewDetalheRouter,
  createImoviewRouter,
} from './imoview-router.js';
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
): (uploadMutex?: Mutex) => Promise<ExecucaoStats> {
  return async function run(
    uploadMutex: Mutex = new Mutex(),
  ): Promise<ExecucaoStats> {
    const maxListingPages = getMaxListingPagesPerCrawl(origem);
    const cidade = await resolveCidadeCode(baseUrl, cidadeSlugAmigavel);
    const dataset = await openFreshDataset(origem);
    const capturaDataset = await openFreshDataset<RawCaptureItem>(
      `${origem}-raw`,
    );
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
        requestHandler: createImoviewRouter(
          dataset,
          capturaDataset,
          baseUrl,
          origem,
        ),
        requestQueue,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: maxListingPages,
        // Sem isso, o SessionPool desta fonte se autopersiste no Key-Value Store
        // DEFAULT do processo, com a mesma chave usada por qualquer outro crawler —
        // sob SPIDER_BATCH_SIZE > 1, duas fontes escrevendo ali ao mesmo tempo (o
        // evento persistState do Crawlee dispara pra todas juntas, a cada 60s)
        // corrompeu esse arquivo em runs reais (JSON5: invalid end of input). Um
        // Key-Value Store nomeado por origem isola cada fonte completamente. Mesmo
        // risco existiria com `context.useState()` — não usar sem configurar um KVS
        // próprio pelo mesmo motivo.
        sessionPoolOptions: {
          persistStateKeyValueStoreId: `${origem}-sessions`,
        },
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
          maxListingPages,
        ),
      );
    }

    // Fase de detalhe: visita cada link único descoberto na listagem — sem teto
    // próprio (o volume já é limitado indiretamente por
    // MAX_LISTING_PAGES_PER_CRAWL). Um link pode aparecer nas duas transações
    // raramente; fica com a primeira tipoTransacao vista, não é crítico pra
    // captura bruta.
    const linksUnicos = new Map<string, TipoTransacao>();
    await dataset.forEach((item) => {
      if (!linksUnicos.has(item.link)) {
        linksUnicos.set(item.link, item.tipoTransacao);
      }
    });
    const linksEncontrados = (await dataset.getInfo())?.itemCount ?? 0;

    if (linksUnicos.size > 0) {
      const detalheQueue = await openFreshRequestQueue(`${origem}-detalhe`);
      await detalheQueue.addRequests(
        [...linksUnicos].map(([url, tipoTransacao]) => ({
          url,
          userData: { tipoTransacao },
        })),
      );
      const detalheCrawler = new HttpCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createImoviewDetalheRouter(capturaDataset, origem),
        requestQueue: detalheQueue,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        // Mesmo id do crawler de listagem acima — nunca rodam ao mesmo tempo dentro
        // desta fonte (sequencial), só entre fontes diferentes é que precisa isolar.
        sessionPoolOptions: {
          persistStateKeyValueStoreId: `${origem}-sessions`,
        },
        errorHandler: (context) => backoffOnRateLimit(context),
        failedRequestHandler: (context, error) => {
          reportFailedRequest(origem, context, error);
        },
      });
      stats.push(
        await runWithWatchdog(
          `${nomeExibicao} detalhe`,
          detalheCrawler.run(),
          linksUnicos.size,
        ),
      );
    }

    // Dentro do mutex: duas fontes chamando uploadCapturasBrutas ao mesmo
    // tempo corrompeu o armazenamento local do Crawlee numa run real (ver
    // upload-mutex.ts).
    let capturasBrutasEnviadas = 0;
    try {
      await uploadMutex.runExclusive(async () => {
        const capturas = await uploadCapturasBrutas(capturaDataset);
        const dataSource = createDataSource();
        await dataSource.initialize();
        try {
          await inserirCapturasBrutas(capturas, dataSource);
        } finally {
          await dataSource.destroy();
        }
        capturasBrutasEnviadas = capturas.length;
        log.info(
          `${nomeExibicao}: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
        );
      });
    } catch (error) {
      log.warning(
        `${nomeExibicao}: captura bruta falhou, run principal não é afetada`,
        { error },
      );
      Sentry.captureException(error, {
        tags: { fonte: origem, fase: 'captura-bruta' },
      });
    }

    return {
      ...sumCrawlStats(stats),
      linksEncontrados,
      linksUnicosDetalhe: linksUnicos.size,
      capturasBrutasEnviadas,
    };
  };
}
