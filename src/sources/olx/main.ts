import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { SAME_DOMAIN_DELAY_SECS } from '../shared/crawler-defaults.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createOlxRouter } from './routes.js';

export async function runOlx(): Promise<void> {
  const startUrls = await loadStartUrls(OrigemAnuncio.OLX);
  const dataset = await openFreshDataset(OrigemAnuncio.OLX);
  const requestQueue = await openFreshRequestQueue(OrigemAnuncio.OLX);

  const crawler = new PlaywrightCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
    requestHandler: createOlxRouter(dataset),
    requestQueue,
    headless: true,
    sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
  });

  await crawler.run(startUrls);

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
