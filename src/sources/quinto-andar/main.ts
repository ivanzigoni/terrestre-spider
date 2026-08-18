import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { HttpCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { backoffOnRateLimit } from '../shared/backoff.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import {
  QUINTO_ANDAR_API_URL,
  businessContextFor,
  buildSearchRequestPayload,
  extractLocationSlug,
} from './api-client.js';
import { createQuintoAndarRouter } from './routes.js';

export async function runQuintoAndar(): Promise<void> {
  const entries = await loadStartUrls(OrigemAnuncio.QUINTO_ANDAR);
  const dataset = await openFreshDataset(OrigemAnuncio.QUINTO_ANDAR);

  // Um crawler por URL de busca (aluguel, venda) — mesmo padrão das outras fontes: o
  // teto de páginas (maxRequestsPerCrawl) vale por URL, não somado entre elas.
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
    });

    await crawler.run([
      {
        url: QUINTO_ANDAR_API_URL,
        method: 'POST',
        payload: buildSearchRequestPayload({
          slug,
          businessContext,
          offset: 0,
        }),
        headers: { 'Content-Type': 'application/json' },
        userData: { transactionType: entry.transactionType, slug, offset: 0 },
      },
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
  await runQuintoAndar();
  await AppDataSource.destroy();
}
