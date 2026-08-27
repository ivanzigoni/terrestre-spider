import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { CheerioCrawler, log, PlaywrightCrawler } from 'crawlee';

import { createDataSource } from '../../persistence/data-source.js';
import type { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
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
  getMaxDetailPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from './crawler-defaults.js';
import {
  createImobiBrasilDescobertaRouter,
  createImobiBrasilDetalheRouter,
} from './imobibrasil-router.js';
import { reportFailedRequest } from './report-failed-request.js';
import { runWithWatchdog } from './run-with-watchdog.js';
import type { SitemapUrlEntry } from './sitemap-client.js';
import { openFreshDataset, openFreshRequestQueue } from './storage.js';

/**
 * Fábrica de `run()` compartilhada pelo cluster ImobiBrasil — descoberta via sitemap
 * igual ao Loft Sites (`loft-sites-main.ts`), mas a fase de detalhe usa
 * `PlaywrightCrawler` em vez de `CheerioCrawler`: confirmado no diagnóstico ao vivo do
 * lote 4 (`.claude/__workdir/integracao-lote/lotes.md`) que a página de detalhe deste
 * template só entrega conteúdo real (preço, descrição) depois do JS rodar — o HTML cru
 * vem só com `<title>`/meta, sem interceptação de rede possível (0 XHR observado).
 */
export function createImobiBrasilRun(
  baseUrl: string,
  origem: OrigemAnuncio,
  nomeExibicao: string,
): (uploadMutex?: Mutex) => Promise<ExecucaoStats> {
  return async function run(
    uploadMutex: Mutex = new Mutex(),
  ): Promise<ExecucaoStats> {
    const maxDetailPages = getMaxDetailPagesPerCrawl(origem);
    const capturaDataset = await openFreshDataset<RawCaptureItem>(
      `${origem}-raw`,
    );

    const stats: CrawlStats[] = [];

    // Fase 1 — descoberta: acumula em memória via closure, mesmo padrão do Loft Sites.
    const coletados: SitemapUrlEntry[] = [];
    const descobertaQueue = await openFreshRequestQueue(`${origem}-descoberta`);
    const descobertaCrawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createImobiBrasilDescobertaRouter(coletados),
      requestQueue: descobertaQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
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
        `${nomeExibicao} descoberta`,
        descobertaCrawler.run([
          { url: `${baseUrl}/sitemap.xml`, label: 'SITEMAP_ENTRY' },
        ]),
        maxDetailPages,
      ),
    );

    // Dedup por URL + ordena por lastmod desc (mais recente primeiro) + corta no teto
    // ANTES de enfileirar — mesmo raciocínio do Loft Sites.
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

    // Fase 2 — detalhe: PlaywrightCrawler (não CheerioCrawler) — ver justificativa no
    // comentário do módulo. Mesmo padrão de sessão/erro do
    // `imoview-browser-main.ts`.
    if (cortados.length > 0) {
      const detalheQueue = await openFreshRequestQueue(`${origem}-detalhe`);
      await detalheQueue.addRequests(cortados.map(([url]) => ({ url })));
      const detalheCrawler = new PlaywrightCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createImobiBrasilDetalheRouter(capturaDataset, origem),
        requestQueue: detalheQueue,
        headless: true,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: maxDetailPages,
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
      linksEncontrados: porUrl.size,
      linksUnicosDetalhe: cortados.length,
      capturasBrutasEnviadas,
    };
  };
}
