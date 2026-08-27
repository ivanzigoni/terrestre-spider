import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { CheerioCrawler, log } from 'crawlee';

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
import type { SitemapUrlEntry } from './loft-sites-client.js';
import {
  createLoftSitesDescobertaRouter,
  createLoftSitesDetalheRouter,
} from './loft-sites-router.js';
import { reportFailedRequest } from './report-failed-request.js';
import { runWithWatchdog } from './run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from './storage.js';

/**
 * Fábrica de `run()` compartilhada por toda imobiliária do cluster GTM Capital/Loft
 * Sites — só `baseUrl`/`origem`/`nomeExibicao` mudam entre elas (ver
 * `discovery/independentes-diagnostico.md`, Achado 3, e lote 3 de
 * `.claude/__workdir/integracao-lote/lotes.md`).
 *
 * Fluxo em 2 fases, diferente do padrão Kenlo/Imoview (lá a listagem já é o dado de
 * negócio; aqui é só descoberta de links via sitemap — ver `loft-sites-router.ts`):
 * 1. Descoberta: `CheerioCrawler` sobre `/sitemap.xml` → `/sitemaps/imoveis-N.xml`,
 *    sem teto (custo de buscar poucos arquivos XML pequenos é baixo, não é o gargalo).
 * 2. Detalhe: ordena os links coletados por `lastmod` desc (mais recentes primeiro,
 *    mesmo raciocínio do teto de listagem do Imoview/Kenlo — captura o que mudou mais
 *    recentemente sob um teto) e corta em `getMaxDetailPagesPerCrawl(origem)` ANTES de
 *    enfileirar, pra não enfileirar milhares de URLs pra depois descartar a maioria
 *    silenciosamente no meio do crawl.
 */
export function createLoftSitesRun(
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

    // Fase 1 — descoberta: acumula em memória via closure (sem Dataset próprio, ver
    // `loft-sites-router.ts`).
    const coletados: SitemapUrlEntry[] = [];
    const descobertaQueue = await openFreshRequestQueue(`${origem}-descoberta`);
    const descobertaCrawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createLoftSitesDescobertaRouter(coletados),
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
    // Sem teto explícito (`maxRequestsPerCrawl`) — quantidade de arquivos de sitemap é
    // pequena (ex.: 19 no maior caso observado no lote 3), watchdog usa um piso de 5min
    // já generoso pra esse volume.
    stats.push(
      await runWithWatchdog(
        `${nomeExibicao} descoberta`,
        descobertaCrawler.run([
          { url: `${baseUrl}/sitemap.xml`, label: 'SITEMAP_INDEX' },
        ]),
        maxDetailPages,
      ),
    );

    // Dedup por URL (defensivo — sitemaps diferentes não deveriam repetir a mesma URL de
    // imóvel, mas não é garantido) + ordena por lastmod desc (mais recente primeiro,
    // ausência de lastmod vai pro final) + corta no teto ANTES de enfileirar.
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

    // Fase 2 — detalhe: uma request por imóvel único descoberto na fase 1. Sem dataset de
    // itens estruturados (a pipeline não estrutura mais dado de anúncio) — só captura
    // bruta, gravada dentro do próprio router de detalhe.
    if (cortados.length > 0) {
      const detalheQueue = await openFreshRequestQueue(`${origem}-detalhe`);
      await detalheQueue.addRequests(cortados.map(([url]) => ({ url })));
      const detalheCrawler = new CheerioCrawler({
        httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
        requestHandler: createLoftSitesDetalheRouter(capturaDataset, origem),
        requestQueue: detalheQueue,
        sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
        maxRequestsPerCrawl: maxDetailPages,
        // Mesmo id do crawler de descoberta acima — nunca rodam ao mesmo tempo dentro
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
          cortados.length,
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
      linksEncontrados: porUrl.size,
      linksUnicosDetalhe: cortados.length,
      capturasBrutasEnviadas,
    };
  };
}
