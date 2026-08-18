import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { CheerioCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createOlxRouter } from './routes.js';

export async function runOlx(): Promise<void> {
  const entries = await loadStartUrls(OrigemAnuncio.OLX);
  const dataset = await openFreshDataset(OrigemAnuncio.OLX);

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.OLX}-${entry.transactionType}`,
    );
    const crawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createOlxRouter(dataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
      errorHandler: (context) => backoffOnRateLimit(context),
    });
    await crawler.run([
      { url: entry.url, userData: { transactionType: entry.transactionType } },
    ]);
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await loadIntoPostgres(dataset, AppDataSource);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`
) {
  await runOlx();
  await AppDataSource.destroy();
}
