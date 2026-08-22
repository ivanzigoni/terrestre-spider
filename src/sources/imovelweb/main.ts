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
import { runWithWatchdog } from '../shared/run-with-watchdog.js';
import { openFreshDataset, openFreshRequestQueue } from '../shared/storage.js';
import { createImovelwebRouter } from './routes.js';

export async function runImovelweb(): Promise<CrawlStats> {
  const entries = await loadStartUrls(OrigemAnuncio.IMOVELWEB);
  const dataset = await openFreshDataset(OrigemAnuncio.IMOVELWEB);

  // Um crawler por URL de busca (aluguel, venda) — o teto de páginas
  // (maxRequestsPerCrawl) vale por URL, não somado entre elas.
  const stats: CrawlStats[] = [];
  for (const entry of entries) {
    const requestQueue = await openFreshRequestQueue(
      `${OrigemAnuncio.IMOVELWEB}-${entry.tipoTransacao}`,
    );
    const crawler = new PlaywrightCrawler({
      httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
      requestHandler: createImovelwebRouter(dataset),
      requestQueue,
      headless: true,
      sameDomainDelaySecs: SAME_DOMAIN_DELAY_SECS,
      maxRequestsPerCrawl: MAX_REQUESTS_PER_CRAWL,
      // O SessionPool do Crawlee (`_throwOnBlockedRequest`, em basic-crawler.js) aposenta a
      // sessão e lança erro de imediato em qualquer resposta 401/403/429, ANTES até da
      // heurística própria do Crawlee pra desafio Cloudflare (que espera 5s e reavalia)
      // rodar. Diagnosticado ao vivo: sem este ajuste, um 403 vindo do desafio Cloudflare
      // sempre aposentava a sessão inteira (perdendo o cookie __cf_bm já conquistado) e
      // reiniciava do zero — o pior caminho contra um mecanismo de scoring comportamental,
      // que penaliza sessão nova mais que sessão contínua. Tiramos só 403 dessa lista —
      // 401/429 continuam aposentando a sessão normalmente.
      //
      // Isso reduz o dano, mas não elimina o desafio: em execuções de teste, o ponto em
      // que a Cloudflare passou a exigir o desafio variou entre a 2ª e a 5ª página, e em
      // modo headless (o modo de produção) o desafio às vezes não passou sozinho dentro de
      // 30s, mesmo continuando na mesma sessão. Quando isso acontece, o waitForSelector do
      // router (routes.ts) só encontra 0 cards e nenhum link de próxima página — o handler
      // não lança erro, só para de enfileirar novas páginas ali, sem travar a fonte
      // inteira. Ou seja: a seed captura o que conseguir antes da barreira aparecer, sem
      // garantia de alcançar o teto de página 5 já imposto pelo robots.txt (routes.ts) —
      // e, de qualquer forma, não há, e não deve haver, nenhuma tentativa de resolver o
      // desafio interativamente.
      sessionPoolOptions: { blockedStatusCodes: [401, 429] },
      errorHandler: (context) => backoffOnRateLimit(context),
      failedRequestHandler: (context, error) => {
        reportFailedRequest(OrigemAnuncio.IMOVELWEB, context, error);
      },
    });
    stats.push(
      await runWithWatchdog(
        `Imovelweb ${entry.tipoTransacao}`,
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
  await runImovelweb();
}
