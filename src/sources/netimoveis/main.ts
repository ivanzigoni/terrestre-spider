import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import * as Sentry from '@sentry/node';
import { log, PlaywrightCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { createDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import type { TipoTransacao } from '../../persistence/enums/tipo-transacao.enum.js';
// import { loadIntoPostgres } from '../../persistence/load.js';
import {
  inserirCapturasBrutas,
  uploadCapturasBrutas,
} from '../../persistence/load-raw-captures.js';
import type { RawCaptureItem } from '../../persistence/raw-capture-item.js';
import { Mutex } from '../../persistence/upload-mutex.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import { type CrawlStats, sumCrawlStats } from '../shared/crawl-stats.js';
import {
  getMaxListingPagesPerCrawl,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { reportFailedRequest } from '../shared/report-failed-request.js';
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import {
  createNetimoveisDetalheRouter,
  createNetimoveisRouter,
} from './routes.js';

export async function runNetimoveis(
  uploadMutex: Mutex = new Mutex(),
): Promise<CrawlStats> {
  const maxListingPages = getMaxListingPagesPerCrawl(OrigemAnuncio.NETIMOVEIS);
  const entries = await loadStartUrls(OrigemAnuncio.NETIMOVEIS);
  const dataset = await openFreshDataset(OrigemAnuncio.NETIMOVEIS);
  const capturaDataset = await openFreshDataset<RawCaptureItem>(
    `${OrigemAnuncio.NETIMOVEIS}-raw`,
  );

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.NETIMOVEIS}-${entry.tipoTransacao}`,
    );
    const crawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createNetimoveisRouter(dataset, capturaDataset),
      requestQueue,
      headless: true,
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
        persistStateKeyValueStoreId: `${OrigemAnuncio.NETIMOVEIS}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.NETIMOVEIS, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `Netimóveis ${entry.tipoTransacao}`,
        crawler.run([
          {
            url: entry.url,
            userData: { tipoTransacao: entry.tipoTransacao },
          },
        ]),
        maxListingPages,
      ),
    );
  }

  // Fase de detalhe: visita cada link único descoberto na listagem — sem teto próprio
  // (o volume já é limitado indiretamente por MAX_LISTING_PAGES_PER_CRAWL). Um link
  // pode aparecer nas duas transações raramente; fica com a primeira tipoTransacao
  // vista, não é crítico pra captura bruta.
  const linksUnicos = new Map<string, TipoTransacao>();
  await dataset.forEach((item) => {
    if (!linksUnicos.has(item.link)) {
      linksUnicos.set(item.link, item.tipoTransacao);
    }
  });

  if (linksUnicos.size > 0) {
    const detalheQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.NETIMOVEIS}-detalhe`,
    );
    await detalheQueue.addRequests(
      [...linksUnicos].map(([url, tipoTransacao]) => ({
        url,
        userData: { tipoTransacao },
      })),
    );
    const detalheCrawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createNetimoveisDetalheRouter(capturaDataset),
      requestQueue: detalheQueue,
      headless: true,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      // Mesmo id do crawler de listagem acima — nunca rodam ao mesmo tempo dentro
      // desta fonte (sequencial), só entre fontes diferentes é que precisa isolar.
      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${OrigemAnuncio.NETIMOVEIS}-sessions`,
      },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.NETIMOVEIS, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        'Netimóveis detalhe',
        detalheCrawler.run(),
        linksUnicos.size,
      ),
    );
  }

  // anuncios/observacoes_preco foram descontinuadas (ver migration
  // DropAnunciosTables) — loadIntoPostgres fica comentado, não apagado.
  //
  // const dataSource = createDataSource();
  // await dataSource.initialize();
  // try {
  //   await loadIntoPostgres(dataset, dataSource);
  // } finally {
  //   await dataSource.destroy();
  // }

  // Dentro do mutex: duas fontes chamando uploadCapturasBrutas ao mesmo
  // tempo corrompeu o armazenamento local do Crawlee numa run real desta
  // própria fonte (ver upload-mutex.ts).
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
      log.info(
        `Netimóveis: ${String(capturas.length)} captura(s) bruta(s) enviada(s) ao bucket e registrada(s) em capturas_brutas`,
      );
    });
  } catch (error) {
    log.warning(
      'Netimóveis: captura bruta falhou, run principal não é afetada',
      { error },
    );
    Sentry.captureException(error, {
      tags: { fonte: OrigemAnuncio.NETIMOVEIS, fase: 'captura-bruta' },
    });
  }

  return sumCrawlStats(stats);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runNetimoveis();
}
