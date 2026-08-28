import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { CheerioCrawler, log } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { createDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
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
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import {
  createCasaMineiraDetalheRouter,
  createCasaMineiraRouter,
} from './routes.js';

/**
 * Casa Mineira — portal regional do Grupo QuintoAndar (plataforma Navent), mesmo
 * padrão dos portais grandes já integrados (`olx/main.ts`): uma URL de busca por
 * tipoTransacao, cobrindo a cidade inteira de uma vez (sem precisar enumerar bairro por
 * bairro — `/venda/imovel/belo-horizonte_mg` já cobre todos os tipos de imóvel).
 * Detalhes da investigação em `.claude/__workdir/integracao-lote/lotes.md`.
 */
export async function runCasaMineira(
  uploadMutex: Mutex = new Mutex(),
): Promise<ExecucaoStats> {
  const maxListingPages = getMaxListingPagesPerCrawl(
    OrigemAnuncio.CASA_MINEIRA,
  );
  const entries = await loadStartUrls(OrigemAnuncio.CASA_MINEIRA);
  const dataset = await openFreshDataset(OrigemAnuncio.CASA_MINEIRA);
  const capturaDataset = await openFreshDataset<RawCaptureItem>(
    `${OrigemAnuncio.CASA_MINEIRA}-raw`,
  );

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.CASA_MINEIRA}-${entry.tipoTransacao}`,
    );
    const crawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createCasaMineiraRouter(dataset, capturaDataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: maxListingPages,
      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${OrigemAnuncio.CASA_MINEIRA}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.CASA_MINEIRA, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `Casa Mineira ${entry.tipoTransacao}`,
        crawler.run([
          {
            url: entry.url,
            userData: {
              tipoTransacao: entry.tipoTransacao,
              searchUrl: entry.url,
              numeroPagina: 1,
            },
          },
        ]),
        maxListingPages,
      ),
    );
  }

  // Fase de detalhe: visita cada link único descoberto na listagem — sem teto próprio,
  // mesmo padrão do OLX.
  const linksUnicos = new Map<string, TipoTransacao>();
  await dataset.forEach((item) => {
    if (!linksUnicos.has(item.link)) {
      linksUnicos.set(item.link, item.tipoTransacao);
    }
  });
  const linksEncontrados = (await dataset.getInfo())?.itemCount ?? 0;

  if (linksUnicos.size > 0) {
    const detalheQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.CASA_MINEIRA}-detalhe`,
    );
    await detalheQueue.addRequests(
      [...linksUnicos].map(([url, tipoTransacao]) => ({
        url,
        userData: { tipoTransacao },
      })),
    );
    const detalheCrawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createCasaMineiraDetalheRouter(capturaDataset),
      requestQueue: detalheQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${OrigemAnuncio.CASA_MINEIRA}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.CASA_MINEIRA, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        'Casa Mineira detalhe',
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
        `Casa Mineira: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
      );
    });
  } catch (error) {
    log.warning(
      'Casa Mineira: captura bruta falhou, run principal não é afetada',
      { error },
    );
    Sentry.captureException(error, {
      tags: { fonte: OrigemAnuncio.CASA_MINEIRA, fase: 'captura-bruta' },
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
  await runCasaMineira();
}
