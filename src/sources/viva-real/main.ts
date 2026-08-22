import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { CheerioCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import { type CrawlStats, sumCrawlStats } from '../shared/crawl-stats.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { reportFailedRequest } from '../shared/report-failed-request.js';
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createVivaRealRouter } from './routes.js';

export async function runVivaReal(): Promise<CrawlStats> {
  const entries = await loadStartUrls(OrigemAnuncio.VIVA_REAL);
  const dataset = await openFreshDataset(OrigemAnuncio.VIVA_REAL);

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.VIVA_REAL}-${entry.tipoTransacao}`,
    );
    const crawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createVivaRealRouter(dataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.VIVA_REAL, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `Viva Real ${entry.tipoTransacao}`,
        crawler.run([
          {
            url: entry.url,
            userData: { tipoTransacao: entry.tipoTransacao },
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
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runVivaReal();
}
