import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { CheerioCrawler, log, PlaywrightCrawler } from 'crawlee';

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
  createImobiliariaPampulhaDescobertaRouter,
  createImobiliariaPampulhaDetalheRouter,
} from './router.js';

const BASE_URL = 'https://imobiliariapampulha.com.br';
const ORIGEM = OrigemAnuncio.IMOBILIARIA_PAMPULHA;
const NOME_EXIBICAO = 'Imobiliária Pampulha';

export async function runImobiliariaPampulha(
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
    requestHandler: createImobiliariaPampulhaDescobertaRouter(coletados),
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
  // `imovel-sitemap.xml` já é o arquivo-folha (Yoast lista ele no sitemap_index.xml,
  // mas ele mesmo é um <urlset> direto, sem sub-índice) — aponta direto nele.
  stats.push(
    await runWithWatchdog(
      `${NOME_EXIBICAO} descoberta`,
      descobertaCrawler.run([{ url: `${BASE_URL}/imovel-sitemap.xml` }]),
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
    const detalheCrawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createImobiliariaPampulhaDetalheRouter(
        capturaDataset,
        ORIGEM,
      ),
      requestQueue: detalheQueue,
      headless: true,
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
  await runImobiliariaPampulha();
}
