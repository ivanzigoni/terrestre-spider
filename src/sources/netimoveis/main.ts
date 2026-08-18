import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler } from 'crawlee';

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
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createNetimoveisRouter } from './routes.js';

export async function runNetimoveis(): Promise<CrawlStats> {
  const entries = await loadStartUrls(OrigemAnuncio.NETIMOVEIS);
  const dataset = await openFreshDataset(OrigemAnuncio.NETIMOVEIS);

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.NETIMOVEIS}-${entry.transactionType}`,
    );
    const crawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createNetimoveisRouter(dataset),
      requestQueue,
      headless: true,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.NETIMOVEIS, context, error);
      },
    });
    stats.push(
      await crawler.run([
        {
          url: entry.url,
          userData: { transactionType: entry.transactionType },
        },
      ]),
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
  await runNetimoveis();
}
