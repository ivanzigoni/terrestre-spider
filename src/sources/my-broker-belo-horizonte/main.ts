import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { HttpCrawler, log } from 'crawlee';

import { createDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
import {
  inserirCapturasBrutas,
  uploadCapturasBrutas,
} from '../../persistence/load-raw-captures.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { Mutex } from '../../persistence/upload-mutex.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import {
  type CrawlStats,
  type ExecucaoStats,
  sumCrawlStats,
} from '../shared/crawl-stats.js';
import {
  getMaxListingPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { reportFailedRequest } from '../shared/report-failed-request.js';
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import { buildSearchUrl, tipoTransacaoParaUserIntent } from './client.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createMyBrokerDetalheRouter, createMyBrokerRouter } from './router.js';

const ORIGEM = OrigemAnuncio.MY_BROKER_BELO_HORIZONTE;
const NOME_EXIBICAO = 'My Broker Belo Horizonte';

/**
 * My Broker Belo Horizonte — busca via `/api/properties` (ver `client.ts`), uma URL de
 * busca por tipoTransacao (`user_intent=comprar`/`alugar`), mesmo formato do Stilo
 * Netimóveis/Casa Mineira/OLX. `HttpCrawler` porque a listagem é JSON.
 */
export async function runMyBrokerBeloHorizonte(
  uploadMutex: Mutex = new Mutex(),
): Promise<ExecucaoStats> {
  const maxListingPages = getMaxListingPagesPerCrawl(ORIGEM);
  const dataset = await openFreshDataset(ORIGEM);
  const capturaDataset = await openFreshDataset<RawCaptureItem>(
    `${ORIGEM}-raw`,
  );

  const stats: CrawlStats[] = [];
  for (const tipoTransacao of [TipoTransacao.VENDA, TipoTransacao.ALUGUEL]) {
    const userIntent = tipoTransacaoParaUserIntent(tipoTransacao);
    const requestQueue = await openFreshRequestQueue(
      `${ORIGEM}-${tipoTransacao}`,
    );
    const crawler = new HttpCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createMyBrokerRouter(dataset, capturaDataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: maxListingPages,
      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${ORIGEM}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(ORIGEM, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `${NOME_EXIBICAO} ${tipoTransacao}`,
        crawler.run([
          {
            url: buildSearchUrl(userIntent, 1),
            userData: { tipoTransacao, userIntent, numeroPagina: 1 },
          },
        ]),
        maxListingPages,
      ),
    );
  }

  // Fase de detalhe: visita cada link único descoberto na listagem — sem teto próprio,
  // mesmo padrão do OLX/Casa Mineira/Stilo.
  const linksUnicos = new Map<string, TipoTransacao>();
  await dataset.forEach((item) => {
    if (!linksUnicos.has(item.link)) {
      linksUnicos.set(item.link, item.tipoTransacao);
    }
  });
  const linksEncontrados = (await dataset.getInfo())?.itemCount ?? 0;

  if (linksUnicos.size > 0) {
    const detalheQueue = await openFreshRequestQueue(`${ORIGEM}-detalhe`);
    await detalheQueue.addRequests(
      [...linksUnicos].map(([url, tipoTransacao]) => ({
        url,
        userData: { tipoTransacao },
      })),
    );
    const detalheCrawler = new HttpCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createMyBrokerDetalheRouter(capturaDataset),
      requestQueue: detalheQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${ORIGEM}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(ORIGEM, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `${NOME_EXIBICAO} detalhe`,
        detalheCrawler.run(),
        linksUnicos.size,
      ),
    );
  }

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
        `${NOME_EXIBICAO}: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
      );
    });
  } catch (error) {
    log.warning(
      `${NOME_EXIBICAO}: captura bruta falhou, run principal não é afetada`,
      { error },
    );
    Sentry.captureException(error, {
      tags: { fonte: ORIGEM, fase: 'captura-bruta' },
    });
  }

  return {
    ...sumCrawlStats(stats),
    linksEncontrados,
    linksUnicosDetalhe: linksUnicos.size,
    capturasBrutasEnviadas,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runMyBrokerBeloHorizonte();
}
