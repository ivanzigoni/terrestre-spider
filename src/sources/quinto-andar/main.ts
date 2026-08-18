import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { HttpCrawler } from 'crawlee';

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
import {
  QUINTO_ANDAR_API_URL,
  businessContextFor,
  buildSearchRequestPayload,
  extractLocationSlug,
} from './api-client.js';
import { createQuintoAndarRouter } from './routes.js';

export async function runQuintoAndar(): Promise<CrawlStats> {
  const entries = await loadStartUrls(OrigemAnuncio.QUINTO_ANDAR);
  const dataset = await openFreshDataset(OrigemAnuncio.QUINTO_ANDAR);

  // Um crawler por URL de busca (aluguel, venda) — mesmo padrão das outras fontes: o
  // teto de páginas (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.QUINTO_ANDAR}-${entry.transactionType}`,
    );
    const slug = extractLocationSlug(entry.url);
    const businessContext = businessContextFor(entry.transactionType);

    const crawler = new HttpCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createQuintoAndarRouter(dataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.QUINTO_ANDAR, context, error);
      },
    });

    stats.push(
      await runWithWatchdog(
        `Quinto Andar ${entry.transactionType}`,
        crawler.run([
          {
            url: QUINTO_ANDAR_API_URL,
            method: 'POST',
            payload: buildSearchRequestPayload({
              slug,
              businessContext,
              offset: 0,
            }),
            headers: { 'Content-Type': 'application/json' },
            userData: {
              transactionType: entry.transactionType,
              slug,
              offset: 0,
            },
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
  await runQuintoAndar();
}
