import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler } from 'crawlee';

import { loadStartUrls } from '../../config/search-urls.js';
import { AppDataSource } from '../../persistence/data-source.js';
import { OrigemAnuncio } from '../../persistence/enums/origem-anuncio.enum.js';
import { loadIntoPostgres } from '../../persistence/load.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createZapImoveisRouter } from './routes.js';

export async function runZapImoveis(): Promise<void> {
  const startUrls = await loadStartUrls(OrigemAnuncio.ZAP_IMOVEIS);
  const dataset = await openFreshDataset(OrigemAnuncio.ZAP_IMOVEIS);
  const requestQueue = await openFreshRequestQueue(OrigemAnuncio.ZAP_IMOVEIS);

  const crawler = new PlaywrightCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
    requestHandler: createZapImoveisRouter(dataset),
    requestQueue,
    headless: true,
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
  await runZapImoveis();
  await AppDataSource.destroy();
}
