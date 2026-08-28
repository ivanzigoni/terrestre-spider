import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { CheerioCrawler, log } from 'crawlee';

import { createDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
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
  getMaxDetailPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { reportFailedRequest } from '../shared/report-failed-request.js';
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import type { SitemapUrlEntry } from '../shared/sitemap-client.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import {
  createGsaAtivosDescobertaRouter,
  createGsaAtivosDetalheRouter,
} from './router.js';

const BASE_URL = 'https://gsaativos.com.br';
const ORIGEM = OrigemAnuncio.GSA_ATIVOS;
const NOME_EXIBICAO = 'GSA Ativos';

export async function runGsaAtivos(
  uploadMutex: Mutex = new Mutex(),
): Promise<ExecucaoStats> {
  const maxDetailPages = getMaxDetailPagesPerCrawl(ORIGEM);
  const capturaDataset = await openFreshDataset<RawCaptureItem>(
    `${ORIGEM}-raw`,
  );

  const stats: CrawlStats[] = [];
  const coletados: SitemapUrlEntry[] = [];
  const descobertaQueue = await openFreshRequestQueue(`${ORIGEM}-descoberta`);
  const descobertaCrawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
    requestHandler: createGsaAtivosDescobertaRouter(coletados),
    requestQueue: descobertaQueue,
    sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
    sessionPoolOptions: {
      persistStateKeyValueStoreId: `${ORIGEM}-sessions`,
    },
    errorHandler: (context) => backoffOnRateLimit(context),
    failedRequestHandler: (context, error) => {
      reportFailedRequest(ORIGEM, context, error);
    },
  });
  // Sitemap nativo do WordPress (não Yoast) tem um único arquivo pro custom post type
  // "imoveis" (~230 itens observados — WP só divide em "-2.xml" acima de 2000 URLs por
  // arquivo). Aponta direto pro arquivo, sem passar pelo índice
  // (wp-sitemap.xml lista dezenas de post types/taxonomias irrelevantes).
  stats.push(
    await runWithWatchdog(
      `${NOME_EXIBICAO} descoberta`,
      descobertaCrawler.run([
        { url: `${BASE_URL}/wp-sitemap-posts-imoveis-1.xml` },
      ]),
      maxDetailPages,
    ),
  );

  const porUrl = new Map<string, string | null>();
  for (const entrada of coletados) {
    if (!porUrl.has(entrada.url)) {
      porUrl.set(entrada.url, entrada.lastmod);
    }
  }
  const ordenados = [...porUrl.entries()].sort(([, a], [, b]) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? 1 : -1;
  });
  const cortados = ordenados.slice(0, maxDetailPages);

  if (cortados.length > 0) {
    const detalheQueue = await openFreshRequestQueue(`${ORIGEM}-detalhe`);
    await detalheQueue.addRequests(cortados.map(([url]) => ({ url })));
    const detalheCrawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createGsaAtivosDetalheRouter(capturaDataset, ORIGEM),
      requestQueue: detalheQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: maxDetailPages,
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
        cortados.length,
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
    linksEncontrados: porUrl.size,
    linksUnicosDetalhe: cortados.length,
    capturasBrutasEnviadas,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runGsaAtivos();
}
