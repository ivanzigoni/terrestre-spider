import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { CheerioCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import {
  MAX_REQUESTS_PER_CRAWL,
  SAME_DOMAIN_DELAY_SECS,
} from '../shared/crawler-defaults.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createVivaRealRouter } from './routes.js';

export async function runVivaReal(): Promise<void> {
  const entries = await loadStartUrls(OrigemAnuncio.VIVA_REAL);
  const dataset = await openFreshDataset(OrigemAnuncio.VIVA_REAL);

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.VIVA_REAL}-${entry.transactionType}`,
    );
    const crawler = new CheerioCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createVivaRealRouter(dataset),
      requestQueue,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
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
  await runVivaReal();
  await AppDataSource.destroy();
}
