import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { SAME_DOMAIN_DELAY_SECS } from '../shared/crawler-defaults.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createNetimoveisRouter } from './routes.js';

export async function runNetimoveis(): Promise<void> {
  const startUrls = await loadStartUrls(OrigemAnuncio.NETIMOVEIS);
  const dataset = await openFreshDataset(OrigemAnuncio.NETIMOVEIS);
  const requestQueue = await openFreshRequestQueue(OrigemAnuncio.NETIMOVEIS);

  const crawler = new PlaywrightCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
    requestHandler: createNetimoveisRouter(dataset),
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
  await runNetimoveis();
  await AppDataSource.destroy();
}
