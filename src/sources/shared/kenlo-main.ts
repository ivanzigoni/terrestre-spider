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
import { buildSearchUrl } from './kenlo-client.js';
import { createKenloDetalheRouter, createKenloRouter } from './kenlo-router.js';
import { reportFailedRequest } from './report-failed-request.js';
import { runWithWatchdog } from './run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from './storage.js';

/**
 * Fábrica de `run()` compartilhada por toda imobiliária do cluster Kenlo — só
 * `baseUrl`/`origem`/`nomeExibicao` mudam entre elas (ver
 * `discovery/independentes-diagnostico.md`, Achado 2, e lote 2 de
 * `.claude/__workdir/integracao-lote/lotes.md`). Diferente do Imoview,
 * `cidadeSlug` não precisa de resolução prévia via API — o slug amigável já é aceito
 * diretamente no path da URL de busca e confirmado que filtra no servidor (ver
 * `buildSearchUrl`/`kenlo-client.ts`).
 */
export function createKenloRun(
  baseUrl: string,
  origem: OrigemAnuncio,
  nomeExibicao: string,
  cidadeSlug = 'belo-horizonte',
): (uploadMutex?: Mutex) => Promise<ExecucaoStats> {
  return async function run(
    uploadMutex: Mutex = new Mutex(),
  ): Promise<ExecucaoStats> {
    const maxListingPages = getMaxListingPagesPerCrawl(origem);
    const dataset = await openFreshDataset(origem);
    const capturaDataset = await openFreshDataset<RawCaptureItem>(
      `${origem}-raw`,
    );

    // Um crawler por tipo de transação (aluguel, venda) — mesmo padrão do Imoview: o
    // teto de páginas (maxRequestsPerCrawl) vale por transação, não somado.
    const stats: CrawlStats[] = [];
    for (const tipoTransacao of Object.values(TipoTransacao)) {
      const requestQueue = await openFreshRequestQueue(
        `${origem}-${tipoTransacao}`,
      );
      const startUrl = buildSearchUrl(baseUrl, {
        tipoTransacao,
        numeroPagina: 1,
        cidadeSlug,
      });
      const crawler = new HttpCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createKenloRouter(
          dataset,
          capturaDataset,
          baseUrl,
          origem,
        ),
        requestQueue,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: maxListingPages,
        // Mesmo motivo do Imoview: isola o SessionPool desta fonte no Key-Value Store,
        // evitando corrupção sob SPIDER_BATCH_SIZE > 1 (ver imoview-main.ts).
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
              url: startUrl,
              userData: { tipoTransacao, cidadeSlug, numeroPagina: 1 },
            },
          ]),
          maxListingPages,
        ),
      );
    }

    // Fase de detalhe: visita cada link único descoberto na listagem — sem teto
    // próprio, mesmo padrão do Imoview.
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
        requestHandler: createKenloDetalheRouter(capturaDataset, origem),
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

    // Dentro do mutex: duas fontes chamando uploadCapturasBrutas ao mesmo tempo
    // corrompeu o armazenamento local do Crawlee numa run real (ver upload-mutex.ts).
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
